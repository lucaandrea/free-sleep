import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { alarmFixture } from './fixtures/alarms.js';
import type { AlarmPreview } from '../src/alarms/types.js';

test('alarm HTTP routes persist one-time changes, reject stale edits, restore and preserve legacy settings', async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'free-sleep-alarm-routes-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'lowdb'));
  const { settings, schedules } = alarmFixture();
  await writeFile(path.join(directory, 'lowdb/settingsDB.json'), JSON.stringify(settings));
  await writeFile(path.join(directory, 'lowdb/schedulesDB.json'), JSON.stringify(schedules));
  process.env.DATA_FOLDER = `${directory}/`; process.env.ENV = 'local';
  // Only mount the routers: no scheduler, socket, hardware monitor or background service is started.
  const { default: alarms } = await import('../src/routes/alarm/alarm.js');
  const { default: preferences } = await import('../src/routes/settings/settings.js');
  const app = express(); app.use(express.json()); app.use('/api', alarms, preferences);
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}/api`;
  const post = (route: string, body: unknown) => fetch(`${origin}/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await fetch(`${origin}/alarm/next?side=other`)).status, 400);
  const original = await (await fetch(`${origin}/alarm/next?side=left`)).json() as AlarmPreview;
  assert.equal(original.alarm?.source, 'routine');
  const changedResponse = await post('alarm/override', { side: 'left', action: 'time', time: '08:00', expectedAt: original.alarm!.at });
  assert.equal(changedResponse.status, 200);
  const changed = await changedResponse.json() as AlarmPreview;
  assert.equal(changed.alarm?.time, '08:00'); assert.equal(changed.alarm?.scheduleDay, 'tuesday');
  assert.equal((await post('alarm/override', { side: 'left', action: 'disable', expectedAt: original.alarm!.at })).status, 409);
  assert.equal((await post('alarm/override', { side: 'left', action: 'time', time: '13:00' })).status, 400);
  await Promise.all([post('settings', { left: { name: 'Me' } }), post('settings', { right: { name: 'Partner' } })]);
  await post('settings', { left: { scheduleOverrides: { alarm: {} } } });
  const saved = await (await fetch(`${origin}/settings`)).json();
  assert.equal(saved.left.name, 'Me'); assert.equal(saved.right.name, 'Partner');
  assert.equal(saved.left.scheduleOverrides.alarm.scheduledAt, changed.alarm!.at);
  const skippedResponse = await post('alarm/override', { side: 'left', action: 'disable', expectedAt: changed.alarm!.at });
  assert.equal(skippedResponse.status, 200);
  const skipped = await skippedResponse.json() as AlarmPreview; assert.equal(skipped.state, 'paused');
  const restore = await post('alarm/override', { side: 'left', action: 'restore',
    expectedExpiresAt: skipped.expiresAt, expectedRevision: skipped.overrideRevision });
  assert.equal(restore.status, 200); assert.equal((await restore.json()).alarm.at, original.alarm!.at);
  await post('alarm/override', { side: 'left', action: 'time', time: '08:00', expectedAt: original.alarm!.at });
  await post('settings', { left: { scheduleOverrides: { alarm: { disabled: false, timeOverride: '', expiresAt: '' } } } });
  const legacy = await (await fetch(`${origin}/settings`)).json();
  assert.equal(legacy.left.scheduleOverrides.alarm.scheduledAt, undefined);
  assert.equal(legacy.left.scheduleOverrides.alarm.replacedAt, undefined);
  assert.equal((await (await fetch(`${origin}/alarm/next?side=left`)).json()).alarm.source, 'routine');
  await post('settings', { left: { awayMode: true } });
  assert.equal((await (await fetch(`${origin}/alarm/next?side=left`)).json()).state, 'away');
});
