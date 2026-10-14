import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { alarmFixture } from './fixtures/alarms.js';
import { applyPreferences, PreferenceChangeSchema, PreferenceConflict, preferenceSnapshot } from '../src/preferences/contract.js';
import { preferencesRouter } from '../src/preferences/router.js';
import { createSettingsUpdater } from '../src/db/settingsUpdater.js';
import { TIME_ZONES } from '../src/db/timeZones.js';

const change = (settings = alarmFixture().settings) => {
  const snapshot = preferenceSnapshot(settings);
  return { podID: snapshot.podID, expected: structuredClone(snapshot.preferences), preferences: structuredClone(snapshot.preferences) };
};
test('preferences validate the shared choices and reject hidden controls or invalid values', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../shared/fixtures/device-demo.json', import.meta.url), 'utf8'));
  assert.deepEqual(fixture.preferences.timeZones, TIME_ZONES);
  assert.ok(PreferenceChangeSchema.safeParse({ podID: fixture.preferences.podID,
    expected: fixture.preferences.preferences, preferences: fixture.preferences.preferences }).success);
  for (const invalid of [
    { timeZone: 'Mars/Olympus' }, { temperatureFormat: 'kelvin' }, { id: 'replacement' },
    { primePodDaily: { time: '24:00', enabled: false } }, { rebootDaily: 'yes' },
    { left: { name: '  ', awayMode: false } }, { left: { name: '😀'.repeat(11), awayMode: false } },
    { right: { name: 'Right', awayMode: false, taps: {} } },
  ]) {
    const input = change(); Object.assign(input.preferences, invalid);
    assert.equal(PreferenceChangeSchema.safeParse(input).success, false);
  }
});
test('edited preferences persist without replacing partner changes, tap bindings or alarm overrides', async () => {
  let persisted = alarmFixture().settings;
  persisted.left.scheduleOverrides.alarm.scheduledAt = '2026-10-15T07:00:00.000Z';
  const store = { data: structuredClone(persisted), read: async () => { store.data = structuredClone(persisted); },
    write: async () => { persisted = structuredClone(store.data); } };
  const update = createSettingsUpdater(store);
  const input = change(persisted); input.preferences.left.name = '  Sleeper  '; input.preferences.temperatureFormat = 'celsius';
  const partner = change(persisted); partner.preferences.right.awayMode = true;
  await Promise.all([update(current => applyPreferences(current, partner)), update(current => applyPreferences(current, input))]);
  assert.equal(persisted.left.name, 'Sleeper'); assert.equal(persisted.temperatureFormat, 'celsius');
  assert.equal(persisted.right.awayMode, true);
  assert.deepEqual(persisted.left.taps, alarmFixture().settings.left.taps);
  assert.equal(persisted.left.scheduleOverrides.alarm.scheduledAt, '2026-10-15T07:00:00.000Z');
  assert.equal(persisted.id, 'test');
});
test('conflicting fields, changed Pods and changed schedule timezones reject the complete save', () => {
  const settings = alarmFixture().settings;
  const input = change(settings); input.preferences.left.name = 'Mine'; input.preferences.right.name = 'Partner';
  settings.right.name = 'Changed elsewhere';
  const before = structuredClone(settings);
  assert.throws(() => applyPreferences(settings, input), PreferenceConflict);
  assert.deepEqual(settings, before);
  const wrongPod = change(settings); wrongPod.podID = 'different';
  assert.throws(() => applyPreferences(settings, wrongPod), /different Pod/);
  for (const update of [
    (value: ReturnType<typeof change>) => { value.preferences.primePodDaily.time = '15:30'; },
    (value: ReturnType<typeof change>) => { value.preferences.primePodDaily.enabled = true; },
    (value: ReturnType<typeof change>) => { value.preferences.rebootDaily = true; },
  ]) {
    const current = alarmFixture().settings; const input = change(current); update(input); current.timeZone = 'Europe/London';
    assert.throws(() => applyPreferences(current, input), /timezone changed/);
  }
});
test('preferences HTTP saves, rejects stale identity and preserves persisted state on write failure', async context => {
  let persisted = alarmFixture().settings; let failing = false;
  const store = { data: structuredClone(persisted), read: async () => { store.data = structuredClone(persisted); }, write: async () => {
    if (failing) throw new Error('storage unavailable'); persisted = structuredClone(store.data);
  } };
  const app = express(); app.use(express.json());
  app.use('/api/settings/preferences', preferencesRouter({ read: async () => structuredClone(persisted), update: createSettingsUpdater(store) }));
  app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({ error: { message: error.message } });
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}/api/settings/preferences`;
  const post = (body: unknown) => fetch(origin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.deepEqual(await (await fetch(origin)).json(), preferenceSnapshot(persisted));
  const input = change(persisted); input.preferences.primePodDaily = { enabled: true, time: '15:30' };
  const saved = await post(input); assert.equal(saved.status, 200);
  assert.equal((await saved.json()).preferences.primePodDaily.time, '15:30');
  assert.equal(persisted.primePodDaily.time, '15:30');
  assert.equal((await post(input)).status, 409);
  assert.equal((await post({ ...change(persisted), podID: 'wrong' })).status, 409);
  assert.equal((await post({ preferences: input.preferences })).status, 400);
  const next = change(persisted); next.preferences.left.name = 'Failed save';
  const before = structuredClone(persisted); failing = true;
  assert.equal((await post(next)).status, 500);
  assert.deepEqual(persisted, before); assert.deepEqual(store.data, before);
});

test('daily reboot at midnight priming wraps to the preceding evening in the Pod timezone', async () => {
  const { primingClock } = await import('../src/jobs/primingClock.js');
  const { default: schedule } = await import('node-schedule');
  for (const [time, expectedHour, expectedMinute] of [['00:15', 23, 15], ['01:00', 0, 0], ['14:45', 13, 45]] as const) {
    const clock = primingClock(time);
    const reboot = new schedule.RecurrenceRule(); reboot.tz = 'America/Los_Angeles'; reboot.hour = clock.rebootHour; reboot.minute = clock.minute;
    assert.equal(reboot.hour, expectedHour); assert.equal(reboot.minute, expectedMinute);
    assert.ok(reboot.isValid());
  }
  const clock = primingClock('00:15');
  const reboot = new schedule.RecurrenceRule(); reboot.tz = 'America/Los_Angeles'; reboot.hour = clock.rebootHour; reboot.minute = clock.minute;
  assert.equal(reboot.nextInvocationDate(new Date('2026-10-14T20:00:00Z')).toISOString(), '2026-10-15T06:15:00.000Z');
  assert.throws(() => primingClock('24:00'));
});
