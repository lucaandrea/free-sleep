import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presenceIntervals, summarizeSleep, SleepObservation } from '../src/analytics/summary.js';
import { localInsights, generateCoaching } from '../src/ai/coach.js';

const record: SleepObservation = {
  id: 1, side: 'left', entered_bed_at: 1000, left_bed_at: 4600,
  present_intervals: JSON.stringify([[500, 2000], [1800, 3000], [4000, 6000]]), times_exited_bed: 1,
};
test('presence clips and unions intervals rather than double counting', () => {
  assert.deepEqual(presenceIntervals(record), [[1000, 3000], [4000, 4600]]);
  assert.deepEqual(presenceIntervals({ ...record, present_intervals: 'broken' }), []);
});
test('empty analytics and absent intervals remain unknown', () => {
  assert.equal(summarizeSleep([], [], 'UTC').summary.averageOccupiedMinutes, null);
  const result = summarizeSleep([{ ...record, present_intervals: '' }], [], 'UTC');
  assert.equal(result.nights[0].occupiedMinutes, null);
  assert.equal(result.nights[0].heartRate, null);
  assert.equal(result.quality.stageClassification, false);
});
test('vitals exclude absence periods, outliers and missing samples', () => {
  const result = summarizeSleep([record], [
    { timestamp: 1500, heart_rate: 60, hrv: 40, breathing_rate: 15 },
    { timestamp: 3500, heart_rate: 120, hrv: 80, breathing_rate: 30 },
    { timestamp: 4200, heart_rate: 999, hrv: null, breathing_rate: null },
  ], 'UTC');
  assert.equal(result.nights[0].heartRate, 60);
  assert.equal(result.nights[0].occupiedMinutes, 43.3);
  assert.equal(result.nights[0].sampleCount, 1);
});
test('wake dates use configured timezone and naps do not count as extra nights', () => {
  const start = Date.parse('2026-03-08T06:00:00Z') / 1000;
  const overnight = { ...record, entered_bed_at: start, left_bed_at: start + 28800, present_intervals: JSON.stringify([[start, start + 28800]]) };
  const nap = { ...overnight, id: 2, entered_bed_at: start + 33000, left_bed_at: start + 35000 };
  const result = summarizeSleep([overnight, nap], [], 'America/Los_Angeles');
  assert.equal(result.nights.length, 1);
  assert.equal(result.episodes.length, 2);
  assert.equal(result.nights[0].date, '2026-03-08');
});
test('local coaching works without keys and does not claim sleep staging', async () => {
  const analytics = summarizeSleep([], [], 'UTC');
  assert.match(localInsights(analytics).limitations[0], /not measured sleep/);
  assert.equal((await generateCoaching('rules', analytics, '')).provider, 'rules');
});

test('weekly comparison uses calendar days without pulling old observations into a sparse week', () => {
  const start = Date.parse('2026-10-01T00:00:00Z') / 1000;
  const records = [0, 1, 2, 3, 4, 5, 6, 13].map((day, index) => {
    const entered = start + day * 86400;
    const left = entered + (day === 13 ? 480 : 360) * 60;
    return { ...record, id: index, entered_bed_at: entered, left_bed_at: left, present_intervals: JSON.stringify([[entered, left]]) };
  });
  const summary = summarizeSleep(records, [], 'UTC').summary;
  assert.equal(summary.recentRecordedNights, 1);
  assert.equal(summary.previousRecordedNights, 7);
  assert.equal(summary.weeklyChangeMinutes, null);
});
