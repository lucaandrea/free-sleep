import type { JournalEntry } from '../analytics/journal.js';
import type { Settings } from '../db/settingsSchema.js';
import type { Schedules, Side } from '../db/schedulesSchema.js';
import type { DeviceStatus } from '../routes/deviceStatus/deviceStatusSchema.js';
import type { ComfortDocument, ComfortStore } from './store.js';
import { comfortConfigSchema } from './types.js';
import type { ComfortConfig, ComfortDecision, ComfortStatus, ControlSource, DeviceUpdate } from './types.js';
import { decideComfort, learnComfort, MANUAL_PAUSE_MS, routineAt, type PresenceReading } from './policy.js';
import type { AutopilotSignals } from '../autopilot/signals.js';
import { entryShift, phaseAdjustedWindow } from '../autopilot/timing.js';

export type ComfortContext = {
  settings: Settings; schedules: Schedules; device: DeviceStatus; observedAt: number;
  presence: Record<Side, PresenceReading>; journal: JournalEntry[];
  signals?: Partial<Record<Side, AutopilotSignals>>;
};
type Apply = (command: DeviceUpdate, notAfter?: number) => Promise<void>;
const sides: Side[] = ['left', 'right'];
const waiting = (): ComfortDecision => ({ reason: 'Waiting for the next comfort check.', baselineF: null, proposedF: null, eligible: false });

export class ComfortController {
  private tail: Promise<unknown> = Promise.resolve();
  private document: ComfortDocument | null = null;
  private fault: string | null = null;
  private stopped = false;
  private signals: Partial<Record<Side, AutopilotSignals>> = {};
  private decisions: Record<Side, ComfortDecision> = { left: waiting(), right: waiting() };
  constructor(private store: ComfortStore, private context: () => Promise<ComfortContext>, private clock = Date.now) {}
  stop() { this.stopped = true; }

  // Settings, scheduled writes, and manual controls share this queue, so an old adaptive decision cannot follow a manual write.
  private serial<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
  private async load() { this.document ??= await this.store.read(); return this.document; }
  private async save() { await this.store.write(this.document!); }
  private event(side: Side, message: string, targetF: number | null = null) {
    const state = this.document![side];
    state.history = [{ at: this.clock(), message, targetF }, ...state.history].slice(0, 60);
  }
  private async suspend(reason: string) {
    this.fault = reason;
    if (this.document) {
      for (const side of sides) { this.document[side].pausedUntil = this.clock() + MANUAL_PAUSE_MS; this.event(side, reason); }
      try { await this.save(); } catch { /* Keep the in-memory suspension even if storage is unavailable. */ }
    }
  }
  status(side: Side): Promise<ComfortStatus> {
    return this.serial(async () => {
      const state = (await this.load())[side];
      const decision = this.fault ? { ...waiting(), reason: this.fault } : state.config.mode === 'off'
        ? { ...waiting(), reason: 'Adaptive comfort is off.' } : this.decisions[side];
      return structuredClone({ config: state.config, offsetF: state.offsetF, pausedUntil: state.pausedUntil || null,
        feedbackThrough: state.feedbackThrough || null, decision, history: state.history,
        signals: this.signals[side], phaseShiftMinutes: state.phaseShiftMinutes ?? 0 });
    });
  }
  configure(side: Side, config: ComfortConfig, reset = false) {
    return this.serial(() => this.configureLocked(side, config, reset));
  }
  setMode(side: Side, mode: ComfortConfig['mode']) {
    // Resolve limits inside the shared queue so a Shortcut never restores an older client's settings.
    return this.serial(async () => {
      const state = (await this.load())[side];
      await this.configureLocked(side, { ...state.config, mode });
    });
  }
  private async configureLocked(side: Side, config: ComfortConfig, reset = false) {
    const state = (await this.load())[side];
    if (this.fault && config.mode === 'active') {
      throw new Error('Adaptive comfort is suspended after an error. Check the Pod and restart its server first.');
    }
    state.config = comfortConfigSchema.parse(config);
    if (reset) {
      state.offsetF = 0;
      // Previously consumed reports stay consumed, so reset cannot immediately relearn from the same data.
      this.event(side, 'Learned adjustment reset to 0°F. Previously reviewed check-ins stay consumed.');
    }
    this.event(side, `Adaptive comfort set to ${config.mode}. Limits ${config.minimumF}–${config.maximumF}°F.`);
    this.decisions[side] = waiting();
    try { await this.save(); }
    catch (error) { await this.suspend('Adaptive comfort is suspended because its settings could not be saved.'); throw error; }
  }
  execute(command: DeviceUpdate, source: ControlSource, apply: Apply, assertCurrent?: () => void): Promise<void> {
    return this.serial(() => {
      assertCurrent?.();
      return this.executeLocked(command, source, apply, assertCurrent);
    });
  }

  private async executeLocked(command: DeviceUpdate, source: ControlSource, apply: Apply, assertCurrent?: () => void) {
    if (this.stopped && source === 'adaptive') return;
    let document: ComfortDocument;
    try { document = await this.load(); }
    catch (error) {
      assertCurrent?.();
      await this.suspend('Adaptive comfort is suspended because its saved data could not be read.');
      if (source === 'adaptive') throw error;
      return apply(command);
    }
    assertCurrent?.();
    if (source === 'manual') {
      let changed = false;
      for (const side of sides) {
        const update = command[side];
        const changesTemperature = update?.targetTemperatureF !== undefined
          || update?.isOn !== undefined || update?.secondsRemaining !== undefined;
        if (document[side].config.mode !== 'off' && (command.isPriming || changesTemperature)) {
          document[side].pausedUntil = this.clock() + MANUAL_PAUSE_MS;
          this.event(side, 'Manual control: adaptive comfort paused for six hours.');
          this.decisions[side] = { ...waiting(), reason: 'Paused for six hours after a manual control. Your routine continues.' };
          changed = true;
        }
      }
      if (changed) {
        try { await this.save(); }
        catch { await this.suspend('Adaptive comfort is suspended because the manual pause could not be saved.'); }
      }
      return apply(command);
    }
    if (this.fault || sides.every(side => document[side].config.mode === 'off')) {
      if (source !== 'adaptive') await apply(command);
      return;
    }
    let snapshot: ComfortContext;
    try { snapshot = await this.context(); }
    catch {
      for (const side of sides) this.decisions[side] = { ...waiting(), reason: 'Waiting for the Pod and fresh presence readings.' };
      if (source !== 'adaptive') await apply(command);
      return;
    }
    const now = this.clock();
    if (now - snapshot.observedAt > 15_000 || now < snapshot.observedAt) {
      for (const side of sides) this.decisions[side] = { ...waiting(), reason: 'Pod readings expired before this comfort check completed.' };
      if (source !== 'adaptive') await apply(command);
      return;
    }
    const outgoing = structuredClone(command);
    this.signals = snapshot.signals ?? {};
    const before = JSON.stringify(document);
    for (const side of sides) {
      const state = document[side];
      const original = routineAt(snapshot.schedules[side], snapshot.settings.timeZone, now);
      let window = original;
      const signals = snapshot.signals?.[side];
      const sensorReady = signals?.state === 'ready' && signals.sampleAt !== null
        && Number.isFinite(signals.sampleAt) && now >= signals.sampleAt && now - signals.sampleAt <= 360_000;
      if (original && state.config.sensorAware && state.config.followBedtime && state.config.mode !== 'off') {
        if (state.timingSession !== original.session && sensorReady) {
          const shift = entryShift(original, snapshot.presence[side], now);
          if (shift !== null) {
            state.timingSession = original.session; state.phaseShiftMinutes = shift;
            this.event(side, `Observed stable bed entry. Intermediate temperature phases shifted ${shift} minutes; wake time stays fixed.`);
          }
        }
        if (state.timingSession === original.session) {
          window = phaseAdjustedWindow(original, snapshot.schedules[side], snapshot.settings.timeZone, now, state.phaseShiftMinutes ?? 0);
        }
      }
      if (window && state.config.mode !== 'off') {
        const feedback = snapshot.journal.filter(entry => entry.side === side);
        const learned = learnComfort(state, feedback, window, snapshot.settings.timeZone, now);
        if (learned) this.event(side, learned);
      }
      const decision = decideComfort({ state, window, now, device: snapshot.device, presence: snapshot.presence[side], side,
        preferences: snapshot.settings[side], eitherAway: snapshot.settings.left.awayMode || snapshot.settings.right.awayMode });
      if (state.config.sensorAware && decision.eligible) {
        if (!sensorReady) {
          decision.eligible = false;
          decision.reason = signals?.state === 'ready' ? 'Pod vital estimates expired before this comfort check completed.'
            : signals?.reason ?? 'Waiting for Pod vital estimates and a personal baseline.';
        } else if (decision.proposedF !== null && original) {
          // Sensor-aware control moves one degree per check and never exceeds ±3°F from the unchanged routine.
          const reference = source === 'schedule' ? command[side]?.targetTemperatureF ?? snapshot.device[side].targetTemperatureF
            : snapshot.device[side].targetTemperatureF;
          decision.proposedF = Math.max(state.config.minimumF, original.baselineF - 3,
            Math.min(state.config.maximumF, original.baselineF + 3, decision.proposedF));
          decision.proposedF = Math.max(reference - 1, Math.min(reference + 1, decision.proposedF));
          if (decision.proposedF < state.config.minimumF || decision.proposedF > state.config.maximumF
            || Math.abs(decision.proposedF - original.baselineF) > 3) {
            decision.eligible = false; decision.reason = 'Waiting for the routine target to enter your Autopilot limits.';
          }
        }
      }
      if (state.config.sensorAware && state.config.mode !== 'off' && this.decisions[side].reason !== decision.reason) {
        this.event(side, decision.reason);
      }
      this.decisions[side] = decision;
      const currentTarget = snapshot.device[side].targetTemperatureF;
      const targetIsKnown = currentTarget === original?.baselineF || currentTarget === window?.baselineF
        || (state.lastSegment === window?.segment && currentTarget === state.lastTargetF)
        || (state.config.sensorAware && original && state.lastSegment.startsWith(`${original.start}:${original.end}:`)
          && currentTarget === state.lastTargetF);
      if (source === 'adaptive' && decision.eligible && !targetIsKnown) {
        state.pausedUntil = now + MANUAL_PAUSE_MS;
        this.decisions[side] = { ...decision, eligible: false,
          reason: 'An unexpected target change paused adaptive comfort for six hours.' };
        this.event(side, 'Unexpected target change: adaptive comfort paused for six hours.');
        continue;
      }
      const scheduledTarget = command[side]?.targetTemperatureF;
      const mayAdjust = decision.eligible && state.config.mode === 'active' && decision.proposedF !== null;
      const adjustsSchedule = source === 'schedule' && scheduledTarget === original?.baselineF && mayAdjust;
      const adjustsNow = source === 'adaptive' && mayAdjust && currentTarget !== decision.proposedF;
      if (adjustsSchedule || adjustsNow) {
        outgoing[side] = { ...outgoing[side], targetTemperatureF: decision.proposedF! };
        state.lastAppliedAt = now;
        const adjustment = `${state.offsetF > 0 ? '+' : ''}${state.offsetF}°F`;
        const guards = state.config.sensorAware ? ', sensor guards passed' : '';
        const message = `Requested ${decision.proposedF}°F from a ${decision.baselineF}°F phase (${adjustment} learned${guards}).`;
        this.event(side, message, decision.proposedF);
      }
      if (window && outgoing[side]?.targetTemperatureF !== undefined) {
        state.lastTargetF = outgoing[side]!.targetTemperatureF!;
        state.lastSegment = window.segment;
      }
    }
    // Persist the decision before sending it. A process restart must never replay an uncertain write.
    try { if (before !== JSON.stringify(document)) await this.save(); }
    catch {
      await this.suspend('Adaptive comfort is suspended because its decision could not be saved.');
      if (source !== 'adaptive') await apply(command);
      return;
    }
    if (!Object.keys(outgoing).length) return;
    // File I/O can stall; never send an adaptive decision based on an expired snapshot.
    if (this.stopped || this.clock() - snapshot.observedAt > 15_000) {
      if (source !== 'adaptive') await apply(command);
      return;
    }
    const adjusted = source === 'adaptive' || JSON.stringify(outgoing) !== JSON.stringify(command);
    try { await apply(outgoing, adjusted ? snapshot.observedAt + 15_000 : undefined); }
    catch (error) {
      await this.suspend('Adaptive comfort is suspended after a failed temperature command. Check the Pod before restarting its server.');
      throw error;
    }
  }
}
