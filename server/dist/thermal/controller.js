
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="1aa84922-bef0-502f-b4e1-a7274e616829")}catch(e){}}();
import { comfortConfigSchema } from './types.js';
import { decideComfort, learnComfort, MANUAL_PAUSE_MS, routineAt } from './policy.js';
import { entryShift, phaseAdjustedWindow } from '../autopilot/timing.js';
const sides = ['left', 'right'];
const waiting = () => ({ reason: 'Waiting for the next comfort check.', baselineF: null, proposedF: null, eligible: false });
export class ComfortController {
    store;
    context;
    clock;
    tail = Promise.resolve();
    document = null;
    fault = null;
    stopped = false;
    signals = {};
    decisions = { left: waiting(), right: waiting() };
    constructor(store, context, clock = Date.now) {
        this.store = store;
        this.context = context;
        this.clock = clock;
    }
    stop() { this.stopped = true; }
    // Settings, scheduled writes, and manual controls share this queue, so an old adaptive decision cannot follow a manual write.
    serial(operation) {
        const result = this.tail.then(operation);
        this.tail = result.catch(() => undefined);
        return result;
    }
    async load() { this.document ??= await this.store.read(); return this.document; }
    async save() { await this.store.write(this.document); }
    event(side, message, targetF = null) {
        const state = this.document[side];
        state.history = [{ at: this.clock(), message, targetF }, ...state.history].slice(0, 60);
    }
    async suspend(reason) {
        this.fault = reason;
        if (this.document) {
            for (const side of sides) {
                this.document[side].pausedUntil = this.clock() + MANUAL_PAUSE_MS;
                this.event(side, reason);
            }
            try {
                await this.save();
            }
            catch { /* Keep the in-memory suspension even if storage is unavailable. */ }
        }
    }
    status(side) {
        return this.serial(async () => {
            const state = (await this.load())[side];
            const decision = this.fault ? { ...waiting(), reason: this.fault } : state.config.mode === 'off'
                ? { ...waiting(), reason: 'Adaptive comfort is off.' } : this.decisions[side];
            return structuredClone({ config: state.config, offsetF: state.offsetF, pausedUntil: state.pausedUntil || null,
                feedbackThrough: state.feedbackThrough || null, decision, history: state.history,
                signals: this.signals[side], phaseShiftMinutes: state.phaseShiftMinutes ?? 0 });
        });
    }
    configure(side, config, reset = false) {
        return this.serial(() => this.configureLocked(side, config, reset));
    }
    setMode(side, mode) {
        // Resolve limits inside the shared queue so a Shortcut never restores an older client's settings.
        return this.serial(async () => {
            const state = (await this.load())[side];
            await this.configureLocked(side, { ...state.config, mode });
        });
    }
    async configureLocked(side, config, reset = false) {
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
        try {
            await this.save();
        }
        catch (error) {
            await this.suspend('Adaptive comfort is suspended because its settings could not be saved.');
            throw error;
        }
    }
    execute(command, source, apply, assertCurrent) {
        return this.serial(() => {
            assertCurrent?.();
            return this.executeLocked(command, source, apply, assertCurrent);
        });
    }
    async executeLocked(command, source, apply, assertCurrent) {
        if (this.stopped && source === 'adaptive')
            return;
        let document;
        try {
            document = await this.load();
        }
        catch (error) {
            assertCurrent?.();
            await this.suspend('Adaptive comfort is suspended because its saved data could not be read.');
            if (source === 'adaptive')
                throw error;
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
                try {
                    await this.save();
                }
                catch {
                    await this.suspend('Adaptive comfort is suspended because the manual pause could not be saved.');
                }
            }
            return apply(command);
        }
        if (this.fault || sides.every(side => document[side].config.mode === 'off')) {
            if (source !== 'adaptive')
                await apply(command);
            return;
        }
        let snapshot;
        try {
            snapshot = await this.context();
        }
        catch {
            for (const side of sides)
                this.decisions[side] = { ...waiting(), reason: 'Waiting for the Pod and fresh presence readings.' };
            if (source !== 'adaptive')
                await apply(command);
            return;
        }
        const now = this.clock();
        if (now - snapshot.observedAt > 15_000 || now < snapshot.observedAt) {
            for (const side of sides)
                this.decisions[side] = { ...waiting(), reason: 'Pod readings expired before this comfort check completed.' };
            if (source !== 'adaptive')
                await apply(command);
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
                        state.timingSession = original.session;
                        state.phaseShiftMinutes = shift;
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
                if (learned)
                    this.event(side, learned);
            }
            const decision = decideComfort({ state, window, now, device: snapshot.device, presence: snapshot.presence[side], side,
                preferences: snapshot.settings[side], eitherAway: snapshot.settings.left.awayMode || snapshot.settings.right.awayMode });
            if (state.config.sensorAware && decision.eligible) {
                if (!sensorReady) {
                    decision.eligible = false;
                    decision.reason = signals?.state === 'ready' ? 'Pod vital estimates expired before this comfort check completed.'
                        : signals?.reason ?? 'Waiting for Pod vital estimates and a personal baseline.';
                }
                else if (decision.proposedF !== null && original) {
                    // Sensor-aware control moves one degree per check and never exceeds ±3°F from the unchanged routine.
                    const reference = source === 'schedule' ? command[side]?.targetTemperatureF ?? snapshot.device[side].targetTemperatureF
                        : snapshot.device[side].targetTemperatureF;
                    decision.proposedF = Math.max(state.config.minimumF, original.baselineF - 3, Math.min(state.config.maximumF, original.baselineF + 3, decision.proposedF));
                    decision.proposedF = Math.max(reference - 1, Math.min(reference + 1, decision.proposedF));
                    if (decision.proposedF < state.config.minimumF || decision.proposedF > state.config.maximumF
                        || Math.abs(decision.proposedF - original.baselineF) > 3) {
                        decision.eligible = false;
                        decision.reason = 'Waiting for the routine target to enter your Autopilot limits.';
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
                outgoing[side] = { ...outgoing[side], targetTemperatureF: decision.proposedF };
                state.lastAppliedAt = now;
                const adjustment = `${state.offsetF > 0 ? '+' : ''}${state.offsetF}°F`;
                const guards = state.config.sensorAware ? ', sensor guards passed' : '';
                const message = `Requested ${decision.proposedF}°F from a ${decision.baselineF}°F phase (${adjustment} learned${guards}).`;
                this.event(side, message, decision.proposedF);
            }
            if (window && outgoing[side]?.targetTemperatureF !== undefined) {
                state.lastTargetF = outgoing[side].targetTemperatureF;
                state.lastSegment = window.segment;
            }
        }
        // Persist the decision before sending it. A process restart must never replay an uncertain write.
        try {
            if (before !== JSON.stringify(document))
                await this.save();
        }
        catch {
            await this.suspend('Adaptive comfort is suspended because its decision could not be saved.');
            if (source !== 'adaptive')
                await apply(command);
            return;
        }
        if (!Object.keys(outgoing).length)
            return;
        // File I/O can stall; never send an adaptive decision based on an expired snapshot.
        if (this.stopped || this.clock() - snapshot.observedAt > 15_000) {
            if (source !== 'adaptive')
                await apply(command);
            return;
        }
        const adjusted = source === 'adaptive' || JSON.stringify(outgoing) !== JSON.stringify(command);
        try {
            await apply(outgoing, adjusted ? snapshot.observedAt + 15_000 : undefined);
        }
        catch (error) {
            await this.suspend('Adaptive comfort is suspended after a failed temperature command. Check the Pod before restarting its server.');
            throw error;
        }
    }
}
//# sourceMappingURL=controller.js.map
//# debugId=1aa84922-bef0-502f-b4e1-a7274e616829
