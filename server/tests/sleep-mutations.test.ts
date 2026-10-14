import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { sleepMutations } from '../src/records/router.js';
import { sleepRecordChange, recordSeconds, MAX_RECORD_SECONDS } from '../src/records/sleepMutation.js';
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const expected = { entered_bed_at: iso(1000), left_bed_at: iso(5000) };
const identity = { side: 'left', expected };
const edit = { ...identity, entered_bed_at: iso(1100), left_bed_at: iso(4000) };

test('record changes validate side, dates, second precision and elapsed window', () => {
  assert.equal(sleepRecordChange.safeParse(edit).success, true);
  for (const change of [
    { ...edit, side: 'both' }, { ...edit, expected: undefined }, { ...edit, id: 90 },
    { ...edit, entered_bed_at: 'invalid' }, { ...edit, left_bed_at: iso(1100) },
    { ...edit, left_bed_at: iso(1100 + MAX_RECORD_SECONDS + 1) },
    { ...edit, entered_bed_at: '2026-10-14T10:00:00.001Z', left_bed_at: '2026-10-14T10:00:00.999Z' },
  ]) assert.equal(sleepRecordChange.safeParse(change).success, false);
  const repeatedHour = { ...edit, entered_bed_at: '2026-11-01T01:30:00-07:00', left_bed_at: '2026-11-01T01:30:00-08:00' };
  assert.equal(sleepRecordChange.safeParse(repeatedHour).success, true);
  assert.equal(recordSeconds(repeatedHour.left_bed_at) - recordSeconds(repeatedHour.entered_bed_at), 3600);
});

test('SQLite edits isolate sides, preserve sensor data and reject concurrent or conflicting changes', async context => {
  const folder = await mkdtemp(join(tmpdir(), 'free-sleep-records-'));
  const database = new PrismaClient({ datasources: { db: { url: `file:${join(folder, 'records.sqlite')}` } } });
  context.after(async () => { await database.$disconnect(); await rm(folder, { recursive: true, force: true }); });
  await database.$executeRawUnsafe(`CREATE TABLE sleep_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT, side TEXT NOT NULL, entered_bed_at INTEGER NOT NULL,
    left_bed_at INTEGER NOT NULL, sleep_period_seconds INTEGER NOT NULL, times_exited_bed INTEGER NOT NULL,
    present_intervals TEXT NOT NULL, not_present_intervals TEXT NOT NULL, UNIQUE(side, entered_bed_at))`);
  await database.$executeRawUnsafe('CREATE TABLE vitals (id INTEGER PRIMARY KEY, side TEXT, timestamp INTEGER, heart_rate REAL, hrv REAL, breathing_rate REAL)');
  await database.$executeRawUnsafe("INSERT INTO vitals VALUES (1, 'left', 2000, 60, 40, 15)");
  const raw = { entered_bed_at: 1000, left_bed_at: 5000, sleep_period_seconds: 4000, times_exited_bed: 2,
    present_intervals: '[[1000,2000],[2200,4300],[4400,5000]]', not_present_intervals: '[[2000,2200],[4300,4400]]' };
  await database.sleep_records.createMany({ data: [{ id: 1, side: 'left', ...raw }, { id: 2, side: 'right', ...raw },
    { id: 3, side: 'left', ...raw, entered_bed_at: 6000, left_bed_at: 8000 }] });
  const app = express(); app.use(express.json()); app.use('/api/analytics/episodes', sleepMutations(database));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const send = (id: string, method: string, body: unknown) => fetch(`http://127.0.0.1:${address.port}/api/analytics/episodes/${id}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  for (const id of ['1x', '0', '-1', '9999999999999']) assert.equal((await send(id, 'PUT', edit)).status, 400);
  assert.equal((await send('1', 'PUT', { ...edit, expected: undefined })).status, 400);
  assert.equal((await send('1', 'DELETE', {})).status, 400);
  assert.equal((await send('1', 'PUT', { ...edit, side: 'right' })).status, 404);
  assert.equal((await send('1', 'DELETE', { ...identity, side: 'right' })).status, 409);
  assert.equal((await send('1', 'PUT', { ...edit, entered_bed_at: iso(6000), left_bed_at: iso(7000) })).status, 409);
  assert.equal((await database.sleep_records.findUniqueOrThrow({ where: { id: 1 } })).entered_bed_at, 1000);
  const responses = await Promise.all([send('1', 'PUT', edit), send('1', 'PUT', { ...edit, left_bed_at: iso(4100) })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [204, 409]);
  const changed = await database.sleep_records.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(changed.entered_bed_at, 1100); assert.equal(changed.times_exited_bed, 1);
  assert.equal(changed.sleep_period_seconds, changed.left_bed_at - 1100);
  assert.equal(changed.present_intervals, raw.present_intervals);
  assert.equal(changed.not_present_intervals, raw.not_present_intervals);
  assert.equal((await database.sleep_records.findUniqueOrThrow({ where: { id: 2 } })).entered_bed_at, 1000);
  assert.equal((await send('1', 'DELETE', identity)).status, 409);
  const current = { side: 'left', expected: { entered_bed_at: iso(changed.entered_bed_at), left_bed_at: iso(changed.left_bed_at) } };
  assert.equal((await send('1', 'DELETE', current)).status, 204);
  assert.equal((await send('1', 'DELETE', current)).status, 409);
  assert.equal(await database.sleep_records.count(), 2); assert.equal(await database.vitals.count(), 1);
  await database.sleep_records.update({ where: { id: 2 }, data: { not_present_intervals: 'broken' } });
  assert.equal((await send('2', 'PUT', { ...edit, side: 'right' })).status, 422);
  assert.equal((await database.sleep_records.findUniqueOrThrow({ where: { id: 2 } })).entered_bed_at, 1000);
});

test('editable demo recomputes the shared analytics and never changes the partner or original readings', async () => {
  const { readFile } = await import('node:fs/promises');
  const { DemoSleepHistory } = await import('../src/records/demo.js');
  const fixture = JSON.parse(await readFile(new URL('../../shared/fixtures/sleep-demo.json', import.meta.url), 'utf8'));
  const history = new DemoSleepHistory(fixture);
  for (const days of [7, 30, 90]) assert.deepEqual(history.analytics('left', days), fixture.ranges[String(days)]);
  assert.deepEqual(history.detail('left', 14), fixture.details['14']);
  const source = history.detail('left', 14)!;
  const request = { side: 'left', expected: { entered_bed_at: source.episode.startedAt, left_bed_at: source.episode.endedAt },
    entered_bed_at: iso(recordSeconds(source.episode.startedAt) + 1800), left_bed_at: iso(recordSeconds(source.episode.endedAt) - 1800) };
  assert.equal(history.mutate(14, request).status, 204);
  const changed = history.detail('left', 14)!;
  assert.equal(changed.episode.occupiedMinutes, 395); assert.equal(changed.episode.windowMinutes, 410);
  assert.deepEqual(history.detail('right', 14)!.episode, source.episode);
  assert.equal(history.mutate(14, request).status, 409);
  assert.equal(history.mutate(14, { side: 'left', expected: request.expected }, true).status, 409);
  assert.equal(history.mutate(14, { ...request, expected: { entered_bed_at: changed.episode.startedAt, left_bed_at: changed.episode.endedAt },
    ...request.expected }).status, 204);
  assert.deepEqual(history.detail('left', 14), source);
  assert.equal(history.mutate(14, { side: 'left', expected: request.expected }, true).status, 204);
  assert.equal(history.detail('left', 14), null);
  assert.equal(history.analytics('left', 30).nights.at(-1)?.id, 15);
  assert.equal(history.analytics('right', 30).episodes.length, 15);
});

test('multi-day corrections keep weekly trends anchored to the latest wake date', async () => {
  const { summarizeSleep } = await import('../src/analytics/summary.js');
  const start = Date.parse('2026-10-01T00:00:00Z') / 1000;
  const common = { side: 'left', times_exited_bed: 0, present_intervals: '[]' };
  const result = summarizeSleep([
    { ...common, id: 1, entered_bed_at: start, left_bed_at: start + 2 * 86400 },
    { ...common, id: 2, entered_bed_at: start + 86400, left_bed_at: start + 86400 + 3600 },
  ], [], 'UTC');
  assert.deepEqual(result.nights.map(night => night.date), ['2026-10-02', '2026-10-03']);
  assert.equal(result.summary.periodEnding, '2026-10-03');
});
