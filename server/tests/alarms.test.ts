import { alarmFixture } from './fixtures/alarms.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AlarmChangeSchema } from '../src/alarms/schema.js';
import { alarmRule, changeAlarm, overrideOccurrence, previewAlarm, resolveAlarmTime } from '../src/alarms/timing.js';
import { createSettingsUpdater } from '../src/db/settingsUpdater.js';
import { isCurrentOverride, overrideAlarmProfile } from '../src/alarms/overrides.js';

const evening = Date.parse('2026-10-13T22:00:00Z');

test('preview chooses the actual next enabled routine across overnight and week boundaries', () => {
  const { settings, schedules } = alarmFixture();
  assert.deepEqual(previewAlarm(settings, schedules, 'left', evening).alarm, {
    at: '2026-10-14T07:00:00.000Z', time: '07:00', scheduleDay: 'tuesday', source: 'routine' });
  assert.equal(previewAlarm(settings, schedules, 'right', evening).state, 'none');
  schedules.left.tuesday.power.enabled = false;
  schedules.left.saturday.power.enabled = true;
  schedules.left.saturday.alarm.time = '00:30';
  assert.equal(previewAlarm(settings, schedules, 'left', evening).alarm?.at, '2026-10-18T00:30:00.000Z');
  settings.left.awayMode = true;
  assert.equal(previewAlarm(settings, schedules, 'left', evening).state, 'away');
});

test('afternoon routines are not shifted to yesterday by a noon heuristic', () => {
  const { settings, schedules } = alarmFixture();
  schedules.left.tuesday.power.on = '13:00'; schedules.left.tuesday.alarm.time = '18:00';
  assert.equal(previewAlarm(settings, schedules, 'left', Date.parse('2026-10-13T16:00:00Z')).alarm?.at, '2026-10-13T18:00:00.000Z');
});

test('preview uses the scheduler timezone rule at DST transitions', () => {
  const { settings, schedules } = alarmFixture();
  settings.timeZone = 'America/Los_Angeles';
  schedules.left.tuesday.power.enabled = false; schedules.left.saturday.power.enabled = true;
  const before = Date.parse('2026-03-08T07:00:00Z');
  const preview = previewAlarm(settings, schedules, 'left', before);
  assert.equal(preview.alarm?.at, '2026-03-08T14:00:00.000Z');
  assert.equal(preview.alarm?.at, alarmRule('saturday', schedules.left.saturday, settings.timeZone).nextInvocationDate(new Date(before))?.toISOString());
});

test('one-time edits preserve the source routine and do not suppress next week after the original time passes', () => {
  const { settings, schedules } = alarmFixture();
  const original = previewAlarm(settings, schedules, 'left', evening).alarm!;
  settings.left.scheduleOverrides.alarm = changeAlarm(settings, schedules, { side: 'left', action: 'time', time: '08:00', expectedAt: original.at }, evening);
  assert.equal(settings.left.scheduleOverrides.alarm.scheduleDay, 'tuesday');
  assert.equal(settings.left.scheduleOverrides.alarm.replacedAt, original.at);
  const afterOriginal = Date.parse('2026-10-14T07:30:00Z');
  const changed = previewAlarm(settings, schedules, 'left', afterOriginal).alarm!;
  settings.left.scheduleOverrides.alarm = changeAlarm(settings, schedules, { side: 'left', action: 'time', time: '07:45', expectedAt: changed.at }, afterOriginal);
  assert.equal(settings.left.scheduleOverrides.alarm.expiresAt, '2026-10-14T07:47:00.000Z');
  assert.equal(previewAlarm(settings, schedules, 'left', Date.parse('2026-10-14T07:48:00Z')).alarm?.source, 'routine');
});

test('an earlier override and skip continue suppressing the original alarm until its time passes', () => {
  const { settings, schedules } = alarmFixture();
  const original = previewAlarm(settings, schedules, 'left', evening).alarm!;
  settings.left.scheduleOverrides.alarm = changeAlarm(settings, schedules, { side: 'left', action: 'time', time: '06:00', expectedAt: original.at }, evening);
  assert.equal(settings.left.scheduleOverrides.alarm.expiresAt, '2026-10-14T07:02:00.000Z');
  const early = previewAlarm(settings, schedules, 'left', evening).alarm!;
  settings.left.scheduleOverrides.alarm = changeAlarm(settings, schedules, { side: 'left', action: 'disable', expectedAt: early.at }, evening);
  const paused = previewAlarm(settings, schedules, 'left', evening);
  assert.equal(paused.state, 'paused');
  assert.equal(paused.expiresAt, '2026-10-14T07:02:00.000Z');
  settings.left.scheduleOverrides.alarm = changeAlarm(settings, schedules, { side: 'left', action: 'restore',
    expectedExpiresAt: paused.expiresAt!, expectedRevision: paused.overrideRevision! }, evening);
  assert.equal(previewAlarm(settings, schedules, 'left', evening).alarm?.at, original.at);
});

test('stale actions never apply to a different occurrence or a newer override', () => {
  const { settings, schedules } = alarmFixture();
  const original = previewAlarm(settings, schedules, 'left', evening).alarm!;
  assert.throws(() => changeAlarm(settings, schedules, { side: 'left', action: 'disable', expectedAt: original.at }, Date.parse(original.at) + 1), /changed/);
  settings.left.scheduleOverrides.alarm = changeAlarm(settings, schedules, { side: 'left', action: 'disable', expectedAt: original.at }, evening);
  assert.throws(() => changeAlarm(settings, schedules, { side: 'left', action: 'restore', expectedExpiresAt: original.at }, evening), /changed/);
  assert.equal(AlarmChangeSchema.safeParse({ side: 'left', action: 'time', time: '13:00' }).success, false);
  assert.equal(AlarmChangeSchema.safeParse({ side: 'left', action: 'time', time: '25:00', expectedAt: original.at }).success, false);
  assert.equal(AlarmChangeSchema.safeParse({ side: 'left', action: 'disable', expectedAt: original.at, force: true }).success, false);
});

test('restore rejects a replaced override even when its expiry is unchanged', () => {
  const { settings, schedules } = alarmFixture();
  const original = previewAlarm(settings, schedules, 'left', evening).alarm!;
  settings.left.scheduleOverrides.alarm = changeAlarm(settings, schedules, { side: 'left', action: 'time', time: '06:00', expectedAt: original.at }, evening);
  const first = previewAlarm(settings, schedules, 'left', evening);
  settings.left.scheduleOverrides.alarm = changeAlarm(settings, schedules, { side: 'left', action: 'time', time: '06:30', expectedAt: first.alarm!.at }, evening);
  const second = previewAlarm(settings, schedules, 'left', evening);
  assert.equal(first.expiresAt, second.expiresAt);
  assert.notEqual(first.overrideRevision, second.overrideRevision);
  assert.throws(() => changeAlarm(settings, schedules, { side: 'left', action: 'restore',
    expectedExpiresAt: first.expiresAt!, expectedRevision: first.overrideRevision! }, evening), /changed/);
  assert.throws(() => changeAlarm(settings, schedules, { side: 'left', action: 'restore', expectedExpiresAt: second.expiresAt! }, evening), /changed/);
  assert.equal(changeAlarm(settings, schedules, { side: 'left', action: 'restore',
    expectedExpiresAt: second.expiresAt!, expectedRevision: second.overrideRevision! }, evening).expiresAt, '');
});

test('one-time wall-clock edits reject DST gaps and repeats and keep 24-hour afternoon values', () => {
  assert.throws(() => resolveAlarmTime('2026-03-08', '02:30', 'America/Los_Angeles'), /does not exist/);
  assert.throws(() => resolveAlarmTime('2026-11-01', '01:30', 'America/Los_Angeles'), /occurs twice/);
  assert.equal(new Date(resolveAlarmTime('2026-11-01', '14:30', 'America/Los_Angeles')).toISOString(), '2026-11-01T22:30:00.000Z');
  assert.throws(() => resolveAlarmTime('2026-10-04', '02:15', 'Australia/Lord_Howe'), /does not exist/);
  const { settings, schedules } = alarmFixture();
  const now = Date.parse('2026-10-14T06:30:00Z');
  assert.throws(() => changeAlarm(settings, schedules, { side: 'left', action: 'time', time: '06:00', expectedAt: previewAlarm(settings, schedules, 'left', now).alarm!.at }, now), /future time/);
});

test('persisted absolute overrides are never replayed tomorrow, and legacy clock-only overrides honor expiry', () => {
  const absolute = { disabled: false, timeOverride: '07:00', scheduledAt: '2026-10-14T07:00:00Z', expiresAt: '2026-10-14T08:00:00Z' };
  assert.equal(overrideOccurrence(absolute, 'UTC', evening)?.toISOString(), '2026-10-14T07:00:00.000Z');
  assert.equal(overrideOccurrence(absolute, 'UTC', Date.parse('2026-10-14T07:01:00Z')), null);
  assert.equal(overrideOccurrence({ disabled: false, timeOverride: '07:00', expiresAt: absolute.expiresAt }, 'UTC', Date.parse('2026-10-14T07:01:00Z')), null);
});

test('an overnight override uses its original routine profile and rejects cancelled or replaced jobs', () => {
  const { settings, schedules } = alarmFixture();
  schedules.left.wednesday.alarm.vibrationIntensity = 90;
  const original = previewAlarm(settings, schedules, 'left', evening).alarm!;
  const override = changeAlarm(settings, schedules, { side: 'left', action: 'time', time: '08:00', expectedAt: original.at }, evening);
  const profile = overrideAlarmProfile(override, schedules.left, new Date(override.scheduledAt!), 'UTC');
  assert.equal(profile.vibrationIntensity, 20);
  assert.equal(isCurrentOverride(override, structuredClone(override), evening), true);
  assert.equal(isCurrentOverride(override, { disabled: false, timeOverride: '', expiresAt: '' }, evening), false);
  assert.equal(isCurrentOverride(override, { ...override, disabled: true }, evening), false);
  assert.equal(isCurrentOverride(override, { ...override, scheduledAt: '2026-10-14T09:00:00Z' }, evening), false);
  assert.equal(isCurrentOverride(override, override, Date.parse(override.expiresAt)), false);
});

test('concurrent settings changes preserve both sides and a failed write does not poison later updates', async () => {
  const { settings } = alarmFixture();
  let persisted = structuredClone(settings);
  let failWrite = false;
  const store = { data: structuredClone(settings), read: async () => { store.data = structuredClone(persisted); },
    write: async () => { if (failWrite) throw new Error('disk full'); persisted = structuredClone(store.data); } };
  const update = createSettingsUpdater(store);
  await Promise.all([update(async draft => { await Promise.resolve(); draft.left.awayMode = true; }), update(draft => { draft.right.name = 'Partner'; })]);
  assert.equal(persisted.left.awayMode, true); assert.equal(persisted.right.name, 'Partner');
  failWrite = true;
  await assert.rejects(update(draft => { draft.timeZone = 'Europe/London'; }), /disk full/);
  assert.equal(store.data.timeZone, 'UTC');
  failWrite = false;
  await update(draft => { draft.left.name = 'Me'; });
  assert.equal(persisted.left.name, 'Me'); assert.equal(persisted.right.name, 'Partner');
});
