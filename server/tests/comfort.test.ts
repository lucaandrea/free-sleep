import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ComfortController, type ComfortContext } from '../src/thermal/controller.js';
import { comfortStore, type ComfortDocument } from '../src/thermal/store.js';
import { defaultComfortState, type DeviceUpdate } from '../src/thermal/types.js';
import { routineAt, learnComfort, decideComfort, ADJUSTMENT_INTERVAL_MS } from '../src/thermal/policy.js';
import { PresenceMonitor } from '../src/thermal/presence.js';
import type { DailySchedule, SideSchedule } from '../src/db/schedulesSchema.js';
import type { JournalEntry } from '../src/analytics/journal.js';
import { createDispatchGuard } from '../src/control/dispatchGuard.js';

const start = Date.parse('2026-10-13T23:00:00Z');
const daily: DailySchedule = { power: { on: '22:00', off: '08:00', enabled: true, onTemperature: 80 },
  temperatures: { '01:00': 78 }, alarm: { enabled: true, time: '07:00', vibrationIntensity: 30, duration: 30, vibrationPattern: 'rise', alarmTemperature: 82 } };
const week = () => Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  .map(day => [day, structuredClone(daily)])) as SideSchedule;
const entries: JournalEntry[] = [10, 11, 12].map(day => ({ date: `2026-10-${day}`, side: 'left', comfort: 'warm', restfulness: 3,
  caffeine: false, alcohol: false, exercise: false, notes: '' }));
function harness() {
  let now = start;
  let persisted: ComfortDocument = { left: defaultComfortState(), right: defaultComfortState() };
  let savesFail = false;
  const preferences = { awayMode: false, scheduleOverrides: { temperatureSchedules: { disabled: false, expiresAt: '' }, alarm: { disabled: false, timeOverride: '', expiresAt: '' } } };
  const context = { settings: { timeZone: 'UTC', left: structuredClone(preferences), right: structuredClone(preferences) },
    schedules: { left: week(), right: week() }, journal: structuredClone(entries),
    device: { isPriming: false, waterLevel: 'true', left: { targetTemperatureF: 80, isOn: true, isAlarmVibrating: false }, right: { targetTemperatureF: 80, isOn: false } },
    presence: { left: { present: true, lastUpdatedAt: new Date(now).toISOString() }, right: { present: false } }, observedAt: now } as ComfortContext;
  const store = { read: async () => structuredClone(persisted), write: async (document: ComfortDocument) => {
    if (savesFail) throw new Error('disk full'); persisted = structuredClone(document);
  } };
  const controller = new ComfortController(store, async () => structuredClone(context), () => now);
  const sent: DeviceUpdate[] = [];
  const apply = async (command: DeviceUpdate) => {
    sent.push(structuredClone(command));
    for (const side of ['left', 'right'] as const) Object.assign(context.device[side], command[side]);
  };
  const tick = () => controller.execute({}, 'adaptive', apply);
  return { controller, context, store, sent, apply, tick, failSaves: () => { savesFail = true; },
    advance: (milliseconds: number) => { now += milliseconds; context.observedAt = now; context.presence.left.lastUpdatedAt = new Date(now).toISOString(); } };
}
const active = { mode: 'active' as const, minimumF: 70, maximumF: 95 };

test('Sensor-aware Autopilot holds stale or unusual readings and advances by only one degree', async () => {
  const sample = harness();
  await sample.controller.configure('left', { ...active, sensorAware: true });
  await sample.tick(); assert.equal(sample.sent.length, 0);
  sample.context.signals = { left: { state: 'review', reason: 'Review unusual estimate', latestHeartRate: 80,
    baselineHeartRate: 60, baselineDays: 8, sampleAt: start, snoring: 'unavailable' } };
  await sample.tick(); assert.equal(sample.sent.length, 0);
  assert.equal((await sample.controller.status('left')).decision.reason, 'Review unusual estimate');
  sample.context.signals.left!.state = 'ready';
  await sample.tick(); assert.equal(sample.sent[0]?.left?.targetTemperatureF, 79);
  await sample.tick(); assert.equal(sample.sent.length, 1);
  await sample.controller.execute({ left: { targetTemperatureF: 85 } }, 'manual', sample.apply);
  sample.advance(31 * 60_000); await sample.tick();
  assert.equal(sample.sent.length, 2); assert.equal(sample.context.device.left.targetTemperatureF, 85);
});

test('Sensor-aware preview records proposals but never issues a device write', async () => {
  const sample = harness();
  sample.context.signals = { left: { state: 'ready', reason: 'Ready', latestHeartRate: 60,
    baselineHeartRate: 60, baselineDays: 8, sampleAt: start, snoring: 'unavailable' } };
  await sample.controller.configure('left', { ...active, mode: 'preview', sensorAware: true });
  await sample.tick(); assert.equal(sample.sent.length, 0);
  assert.equal((await sample.controller.status('left')).decision.proposedF, 79);
});

test('A delayed phase rejoins the routine after cooldown without mistaking its own target for a manual change', async () => {
  const sample = harness();
  sample.context.journal = [];
  sample.context.presence.left.presentSince = '2026-10-13T22:30:00Z';
  sample.context.signals = { left: { state: 'ready', reason: 'Ready', latestHeartRate: 60,
    baselineHeartRate: 60, baselineDays: 8, sampleAt: start, snoring: 'unavailable' } };
  await sample.controller.configure('left', { ...active, sensorAware: true, followBedtime: true });
  await sample.tick();
  assert.equal((await sample.controller.status('left')).phaseShiftMinutes, 30);
  sample.advance(130 * 60_000);
  sample.context.signals.left!.sampleAt = sample.context.observedAt;
  await sample.controller.execute({ left: { targetTemperatureF: 78 } }, 'schedule', sample.apply);
  assert.equal(sample.context.device.left.targetTemperatureF, 79);
  sample.advance(31 * 60_000);
  sample.context.signals.left!.sampleAt = sample.context.observedAt;
  await sample.tick();
  assert.equal(sample.context.device.left.targetTemperatureF, 78);
  assert.equal((await sample.controller.status('left')).pausedUntil, null);
  assert.equal(sample.sent.length, 2);
});

test('Sensor readiness is rechecked after a slow context read or clock rollback', async () => {
  for (const sampleAt of [start - 361_000, start + 1, NaN, null]) {
    const sample = harness();
    sample.context.signals = { left: { state: 'ready', reason: 'Ready when read', latestHeartRate: 60,
      baselineHeartRate: 60, baselineDays: 8, sampleAt, snoring: 'unavailable' } };
    await sample.controller.configure('left', { ...active, sensorAware: true });
    await sample.tick();
    assert.equal(sample.sent.length, 0);
    assert.match((await sample.controller.status('left')).decision.reason, /expired/);
  }
});

test('Cancelled manual requests cannot pause adaptive comfort after waiting in its queue or loading state', async () => {
  const sample = harness();
  await sample.controller.configure('left', active);
  let release!: () => void;
  const busy = sample.controller.execute({}, 'manual', () => new Promise<void>(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  const cancellation = new AbortController();
  const waiting = sample.controller.execute({ left: { targetTemperatureF: 85 } }, 'manual', sample.apply,
    createDispatchGuard(cancellation.signal, Date.now() + 8000));
  const rejected = assert.rejects(waiting, /cancelled/);
  cancellation.abort(); release(); await busy; await rejected;
  assert.equal((await sample.store.read()).left.pausedUntil, 0);
  assert.equal(sample.sent.length, 0);

  let finishRead!: (document: ComfortDocument) => void;
  let saves = 0;
  const controller = new ComfortController({ read: () => new Promise(resolve => { finishRead = resolve; }),
    write: async () => { saves += 1; } }, async () => sample.context, () => start);
  const cancelledRead = new AbortController();
  const reading = controller.execute({ left: { targetTemperatureF: 85 } }, 'manual', sample.apply,
    createDispatchGuard(cancelledRead.signal, Date.now() + 8000));
  const readRejected = assert.rejects(reading, /cancelled/);
  await new Promise(resolve => setImmediate(resolve));
  cancelledRead.abort(); finishRead(await sample.store.read()); await readRejected;
  assert.equal(saves, 0);
  assert.equal(sample.sent.length, 0);
});

test('routine windows follow local overnight dates, DST and disabled/ambiguous boundaries', () => {
  const schedules = week();
  const window = routineAt(schedules, 'America/Los_Angeles', Date.parse('2026-03-08T10:30:00Z'))!;
  assert.equal(window.start, Date.parse('2026-03-08T06:00:00Z'));
  assert.equal(window.end, Date.parse('2026-03-08T15:00:00Z'));
  assert.equal(window.baselineF, 78);
  assert.equal(routineAt(schedules, 'UTC', Date.parse('2026-10-14T08:00:00Z')), null);
  schedules.tuesday.power.enabled = false;
  assert.equal(routineAt(schedules, 'UTC', start), null);
  schedules.tuesday.power.enabled = true; schedules.tuesday.power.off = '22:00';
  assert.equal(routineAt(schedules, 'UTC', start), null);
});
test('learning consumes three new reports once, ignores future/old reports and caps offset', () => {
  const state = defaultComfortState();
  const window = routineAt(week(), 'UTC', start)!;
  assert.match(learnComfort(state, entries, window, 'UTC', start)!, /-1°F/);
  assert.equal(learnComfort(state, entries, window, 'UTC', start), null);
  assert.equal(learnComfort(state, entries, { ...window, session: 'next' }, 'UTC', start), null);
  state.offsetF = -3; state.feedbackThrough = ''; state.learnedSession = '';
  learnComfort(state, entries, window, 'UTC', start);
  assert.equal(state.offsetF, -3);
  const fresh = defaultComfortState();
  const distant = entries.map(entry => ({ ...entry, date: entry.date.replace('10-', '12-') }));
  learnComfort(fresh, distant, window, 'UTC', start);
  assert.equal(fresh.offsetF, 0);
});
test('off and preview never write; active applies learned target and rate-limits corrections', async () => {
  const sample = harness();
  await sample.tick(); assert.equal(sample.sent.length, 0);
  await sample.controller.configure('left', { ...active, mode: 'preview' });
  await sample.tick(); assert.equal(sample.sent.length, 0);
  assert.equal((await sample.controller.status('left')).offsetF, -1);
  await sample.controller.configure('left', active);
  await sample.tick(); assert.deepEqual(sample.sent, [{ left: { targetTemperatureF: 79 } }]);
  await sample.tick(); assert.equal(sample.sent.length, 1);
  assert.match((await sample.controller.status('left')).decision.reason, /30 minutes/);
  sample.advance(ADJUSTMENT_INTERVAL_MS);
  await sample.tick(); assert.equal(sample.sent.length, 1);
});
test('presence starts unknown and rejects empty updates or client-provided timestamps', () => {
  const presence = new PresenceMonitor(() => start);
  assert.equal(presence.read().left.lastUpdatedAt, undefined);
  assert.throws(() => presence.update({ left: {} }));
  assert.throws(() => presence.update({}));
  const reported = presence.update({ left: { present: true, lastUpdatedAt: '2100-01-01' } });
  assert.equal(reported.left.lastUpdatedAt, new Date(start).toISOString());
});
test('stale/absent presence, off, away, alarms, limits and overrides all prevent adaptive writes', async () => {
  const changes: Array<(context: ComfortContext) => void> = [
    context => { context.presence.left.lastUpdatedAt = new Date(start - 91_000).toISOString(); },
    context => { context.presence.left.present = false; },
    context => { context.device.left.isOn = false; },
    context => { context.settings.right.awayMode = true; },
    context => { context.device.left.isAlarmVibrating = true; },
    context => { context.device.isPriming = true; },
    context => { context.device.waterLevel = 'false'; },
    context => { context.observedAt = start - 16_000; },
    context => { context.settings.left.scheduleOverrides.temperatureSchedules = { disabled: true, expiresAt: '2026-10-14T06:00:00Z' }; },
    context => { context.settings.left.scheduleOverrides.alarm.expiresAt = '2026-10-14T06:00:00Z'; },
    context => { context.schedules.left.tuesday.alarm.time = '23:20'; },
  ];
  for (const change of changes) {
    const sample = harness(); await sample.controller.configure('left', active); change(sample.context);
    await sample.tick(); assert.equal(sample.sent.length, 0);
    assert.equal((await sample.controller.status('left')).decision.eligible, false);
  }
  const sample = harness(); await sample.controller.configure('left', { ...active, minimumF: 81 });
  await sample.tick(); assert.equal(sample.sent.length, 0);
});
test('manual controls win, persist pause across restart, and do not stop ordinary routines', async () => {
  const sample = harness(); await sample.controller.configure('left', active);
  await Promise.all([sample.tick(), sample.controller.execute({ left: { targetTemperatureF: 85 } }, 'manual', sample.apply), sample.tick()]);
  assert.equal(sample.context.device.left.targetTemperatureF, 85);
  const restarted = new ComfortController(sample.store, async () => sample.context, () => start);
  await restarted.execute({}, 'adaptive', sample.apply);
  assert.equal(sample.sent.length, 2);
  await restarted.execute({ left: { targetTemperatureF: 80 } }, 'schedule', sample.apply);
  assert.equal(sample.sent.at(-1)?.left?.targetTemperatureF, 80);
  assert.ok((await restarted.status('left')).pausedUntil! > start);
});
test('scheduled targets use the same learned offset, while unknown targets pause rather than fight', async () => {
  const sample = harness(); await sample.controller.configure('left', active);
  await sample.controller.execute({ left: { targetTemperatureF: 80 } }, 'schedule', sample.apply);
  assert.equal(sample.sent[0].left?.targetTemperatureF, 79);
  sample.advance(ADJUSTMENT_INTERVAL_MS);
  sample.context.device.left.targetTemperatureF = 86;
  await sample.tick(); assert.equal(sample.sent.length, 1);
  assert.match((await sample.controller.status('left')).decision.reason, /unexpected target/i);
});
test('storage errors and uncertain hardware writes suspend automation without replaying; manual power off still works', async () => {
  const sample = harness(); await sample.controller.configure('left', active); sample.failSaves();
  await sample.tick(); assert.equal(sample.sent.length, 0);
  await sample.controller.execute({ left: { isOn: false } }, 'manual', sample.apply);
  assert.equal(sample.sent.length, 1);
  const hardware = harness(); await hardware.controller.configure('left', active);
  await assert.rejects(hardware.controller.execute({}, 'adaptive', async () => { throw new Error('disconnected'); }));
  await hardware.tick(); assert.equal(hardware.sent.length, 0);
  assert.match((await hardware.controller.status('left')).decision.reason, /failed temperature/);
});
test('corrupt persistent state is preserved and refuses automatic control', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'comfort-'));
  try {
    const filename = path.join(directory, 'state.json'); const store = comfortStore(filename);
    const document = await store.read(); await store.write(document);
    await writeFile(filename, 'invalid');
    const controller = new ComfortController(store, async () => { throw new Error('must not reach hardware'); });
    await assert.rejects(controller.execute({}, 'adaptive', async () => assert.fail('must not write')));
    assert.equal(await readFile(filename, 'utf8'), 'invalid');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('limits clamp learned offsets and clock rollback blocks corrections', () => {
  const sample = harness(); const state = defaultComfortState(); state.config = { ...active, minimumF: 80 }; state.offsetF = -3;
  const input = { state, window: routineAt(week(), 'UTC', start), now: start, presence: sample.context.presence.left,
    device: sample.context.device, preferences: sample.context.settings.left, side: 'left' as const, eitherAway: false };
  assert.equal(decideComfort(input).proposedF, 80);
  state.lastAppliedAt = start + 1000;
  assert.equal(decideComfort(input).eligible, false);
});

test('adaptive dispatch carries a deadline and server shutdown drops pending corrections', async () => {
  const sample = harness(); await sample.controller.configure('left', active);
  let deadline: number | undefined;
  await sample.controller.execute({}, 'adaptive', async (command, notAfter) => { deadline = notAfter; await sample.apply(command); });
  assert.equal(deadline, start + 15_000);
  const stopped = harness(); await stopped.controller.configure('left', active);
  stopped.controller.stop(); await stopped.tick();
  assert.equal(stopped.sent.length, 0);
});

test('mode-only changes use the latest queued limits and retain learning, manual pause and partner state', async () => {
  const sample = harness();
  await sample.controller.configure('left', active);
  await sample.tick();
  await sample.controller.execute({ left: { targetTemperatureF: 84 } }, 'manual', sample.apply);
  const before = await sample.store.read();
  const limits = { mode: 'off' as const, minimumF: 75, maximumF: 88 };
  await Promise.all([sample.controller.configure('left', limits), sample.controller.setMode('left', 'preview')]);
  const after = await sample.store.read();
  assert.deepEqual(after.left.config, { ...limits, mode: 'preview' });
  for (const key of ['offsetF', 'feedbackThrough', 'learnedSession', 'pausedUntil', 'lastAppliedAt', 'lastTargetF', 'lastSegment'] as const) {
    assert.equal(after.left[key], before.left[key], key);
  }
  assert.deepEqual(after.right, before.right);
  assert.equal(sample.sent.length, 2); // Only the earlier adaptive and manual controls sent hardware commands.
  assert.match(after.left.history[0].message, /preview.*75–88/);
});

test('mode-only changes preserve the controller suspension after failed persistence', async () => {
  const sample = harness();
  await sample.controller.configure('left', active);
  sample.failSaves();
  await assert.rejects(sample.controller.setMode('left', 'preview'), /disk full/);
  await assert.rejects(sample.controller.setMode('left', 'active'), /suspended/);
  await sample.tick();
  assert.equal(sample.sent.length, 0);
  assert.match((await sample.controller.status('left')).decision.reason, /could not be saved/);
});
