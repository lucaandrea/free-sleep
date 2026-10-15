import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAutopilotSignals, type VitalSample } from '../src/autopilot/signals.js';
import { entryShift, phaseAdjustedWindow } from '../src/autopilot/timing.js';
import { routineAt } from '../src/thermal/policy.js';
import { PresenceMonitor } from '../src/thermal/presence.js';
import type { SideSchedule } from '../src/db/schedulesSchema.js';

const now = Date.parse('2026-10-14T02:00:00Z');
const epoch = now / 1000;
const baseline: VitalSample[] = Array.from({ length: 8 }, (_, day) => Array.from({ length: 12 }, (_, sample) => ({
  timestamp: epoch - (day + 2) * 86400 + sample * 300, heart_rate: 60,
}))).flat();
const recent = (rate: number | null = 60): VitalSample[] => [600, 300].map(seconds => ({ timestamp: epoch - seconds, heart_rate: rate }));

test('Autopilot needs seven adequately observed days, and missing history never becomes a baseline', () => {
  assert.equal(summarizeAutopilotSignals([], recent(), now).state, 'learning');
  assert.equal(summarizeAutopilotSignals(baseline.slice(0, 6 * 12), recent(), now).state, 'learning');
  assert.equal(summarizeAutopilotSignals(baseline, recent(), now).state, 'ready');
  assert.equal(summarizeAutopilotSignals(baseline, recent(), now).snoring, 'unavailable');
});
test('Unequal sample counts do not overweight a single baseline day', () => {
  const heavy = [...baseline, ...Array.from({ length: 100 }, (_, index) => ({ timestamp: epoch - 2 * 86400 + index * 30, heart_rate: 85 }))];
  assert.equal(summarizeAutopilotSignals(heavy, recent(), now).baselineHeartRate, 60);
});
test('Stale, incomplete, duplicate, future, nonfinite, missing and nonconsecutive vital windows abstain', () => {
  for (const samples of [[], recent(null), recent(100), recent(NaN), recent().slice(0, 1),
    [recent()[0], recent()[0]], recent().map(value => ({ ...value, timestamp: value.timestamp - 900 })),
    recent().map(value => ({ ...value, timestamp: value.timestamp + 120 })),
    [{ timestamp: epoch - 900, heart_rate: 60 }, recent()[1]]]) {
    assert.equal(summarizeAutopilotSignals(baseline, samples, now).state, 'stale');
  }
});
test('Sustained relative departures hold extra adjustments, while a single transient does not', () => {
  assert.equal(summarizeAutopilotSignals(baseline, recent(78), now).state, 'review');
  assert.equal(summarizeAutopilotSignals(baseline, recent(45), now).state, 'review');
  assert.equal(summarizeAutopilotSignals(baseline, [recent()[0], { ...recent()[1], heart_rate: 85 }], now).state, 'ready');
  assert.equal(summarizeAutopilotSignals(baseline, [{ ...recent()[0], heart_rate: 45 }, { ...recent()[1], heart_rate: 85 }], now).state, 'ready');
});
test('Presence duration resets on gaps, departure and server restart; client timestamps cannot fabricate bed entry', () => {
  let clock = now;
  const monitor = new PresenceMonitor(() => clock);
  monitor.update({ left: { present: true, lastUpdatedAt: '2000-01-01' } });
  assert.equal(monitor.read().left.presentSince, new Date(now).toISOString());
  clock += 30_000; monitor.update({ left: { present: true } });
  assert.equal(monitor.read().left.presentSince, new Date(now).toISOString());
  clock += 100_000; monitor.update({ left: { present: true } });
  assert.equal(monitor.read().left.presentSince, new Date(clock).toISOString());
  monitor.update({ left: { present: false } });
  assert.equal(monitor.read().left.presentSince, undefined);
  assert.equal(new PresenceMonitor(() => clock).read().left.presentSince, undefined);
});
const routine = { power: { on: '22:00', off: '08:00', enabled: true, onTemperature: 80 }, temperatures: { '01:00': 78 },
  alarm: { enabled: true, time: '07:00', vibrationIntensity: 30, duration: 30, vibrationPattern: 'rise', alarmTemperature: 82 } };
const week = Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  .map(day => [day, routine])) as SideSchedule;
test('Bed-entry alignment requires stable fresh presence and caps the shift at thirty minutes', () => {
  const window = routineAt(week, 'UTC', now)!;
  const reading = { present: true, presentSince: new Date(window.start + 45 * 60_000).toISOString(), lastUpdatedAt: new Date(now).toISOString() };
  assert.equal(entryShift(window, reading, now), 30);
  assert.equal(entryShift(window, { ...reading, presentSince: new Date(window.start - 45 * 60_000).toISOString() }, now), -30);
  assert.equal(entryShift(window, { ...reading, presentSince: new Date(now - 5 * 60_000).toISOString() }, now), null);
  assert.equal(entryShift(window, { ...reading, lastUpdatedAt: new Date(now - 91_000).toISOString() }, now), null);
  assert.equal(entryShift(window, { ...reading, present: false }, now), null);
});
test('A late bedtime delays intermediate phases without moving the alarm, power boundaries or session', () => {
  const check = Date.parse('2026-10-14T01:10:00Z');
  const original = routineAt(week, 'UTC', check)!;
  const shifted = phaseAdjustedWindow(original, week, 'UTC', check, 30);
  assert.equal(original.baselineF, 78); assert.equal(shifted.baselineF, 80);
  assert.equal(shifted.alarmAt, original.alarmAt); assert.equal(shifted.start, original.start);
  assert.equal(shifted.end, original.end); assert.equal(shifted.session, original.session);
});
