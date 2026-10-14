import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { episodeDetail, MAX_EPISODE_SAMPLES, MAX_EPISODE_SECONDS } from '../src/analytics/episode.js';
import { episodeRoutes } from '../src/analytics/episodeRoutes.js';
import type { SleepObservation, VitalObservation } from '../src/analytics/summary.js';

const record: SleepObservation = { id: 42, side: 'left', entered_bed_at: 1000, left_bed_at: 5000,
  present_intervals: '[[1000,2000],[3000,5000]]', times_exited_bed: 1 };
const sample = (timestamp: number, heart_rate: number | null = 60): VitalObservation => ({ timestamp, heart_rate, hrv: 40, breathing_rate: 15 });
test('episode charts split across absence, outliers, missing values and reporting gaps without changing raw readings', () => {
  const result = episodeDetail(record, [sample(900), sample(1000), sample(1300), sample(1600, 999), sample(1900),
    sample(2500), sample(3000), sample(3300, null), sample(3600), sample(4800), sample(5100)], 'UTC');
  assert.equal(result.samples.length, 9);
  assert.equal(result.samples.find(item => item.at === 1600)?.heartRate, 999);
  assert.equal(result.samples.find(item => item.at === 2500)?.present, false);
  assert.deepEqual(result.plots[0].segments.map(segment => segment.map(point => point.seconds)), [[0, 300], [900], [2000], [2600], [3800]]);
  assert.equal(result.plots[0].count, 6);
  assert.equal(result.plots[0].average, result.episode.heartRate);
  assert.deepEqual(result.intervals, [{ start: 0, end: 1000 }, { start: 2000, end: 4000 }]);
});
test('missing presence preserves readings but cannot produce apparently measured sleep or eligible vitals', () => {
  const result = episodeDetail({ ...record, present_intervals: 'broken' }, [sample(1300), sample(1600, null)], 'America/Los_Angeles');
  assert.equal(result.presenceKnown, false);
  assert.equal(result.episode.occupiedMinutes, null);
  assert.equal(result.samples[0].present, null);
  assert.ok(result.plots.every(plot => plot.count === 0 && plot.average === null && plot.segments.length === 0));
});
test('detail limits reject corrupt or excessive records and keep the maximum response within the gateway bound', () => {
  for (const end of [record.entered_bed_at, NaN, Infinity, record.entered_bed_at + MAX_EPISODE_SECONDS + 1]) {
    assert.throws(() => episodeDetail({ ...record, left_bed_at: end }, [], 'UTC'), /72-hour/);
  }
  assert.throws(() => episodeDetail({ ...record, entered_bed_at: 8.64e12, left_bed_at: 8.64e12 + 100 }, [], 'UTC'), /72-hour/);
  assert.throws(() => episodeDetail(record, Array.from({ length: MAX_EPISODE_SAMPLES + 1 }, () => sample(1300)), 'UTC'), /2,880/);
  const readings = Array.from({ length: MAX_EPISODE_SAMPLES }, (_, index) => ({ ...sample(1000 + index), heart_rate: 61.123456789012345 }));
  const detail = episodeDetail({ ...record, present_intervals: '[[1000,5000]]' }, readings, 'UTC');
  assert.ok(Buffer.byteLength(JSON.stringify(detail)) < 1024 * 1024);
});
test('episode HTTP route requires a side, isolates records and validates limits before querying vitals', async context => {
  let vitalsQueries = 0;
  const app = express();
  app.use('/api/analytics', episodeRoutes({
    record: async (id, side) => id === 42 && side === 'left' ? record : id === 43 ? { ...record, id, left_bed_at: 0 } : null,
    vitals: async source => { vitalsQueries++; assert.equal(source.side, 'left'); return [sample(1300)]; },
    timeZone: async () => 'America/Los_Angeles',
  }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const get = (path: string) => fetch(`http://127.0.0.1:${address.port}/api/analytics/episodes/${path}`);
  for (const path of ['42', '42?side=both', '42?side=left&side=right', '42x?side=left', '0?side=left', '9007199254740992?side=left']) {
    assert.equal((await get(path)).status, 400, path);
  }
  assert.equal((await get('42?side=right')).status, 404);
  assert.equal((await get('43?side=left')).status, 422);
  assert.equal(vitalsQueries, 0);
  const response = await get('42?side=left'); assert.equal(response.status, 200);
  const detail = await response.json(); assert.equal(detail.side, 'left'); assert.equal(detail.timeZone, 'America/Los_Angeles');
  assert.equal(detail.episode.id, 42); assert.equal(vitalsQueries, 1);
});
