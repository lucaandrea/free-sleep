import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeSleep } from '../src/analytics/summary.js';
import { coverageForCoaching, dataCoverage, MAX_EPISODE_SECONDS } from '../src/analytics/coverage.js';
import { validateEpisode } from '../src/analytics/episode.js';
import { localInsights } from '../src/ai/coach.js';
import { coverageCases, coverageRecord } from './fixtures/coverage.js';

const results = new Map(coverageCases.map(({ name, records, vitals, timeZone }) => [name, summarizeSleep(records, vitals, timeZone)]));
test('weekly changes require three known-presence nights in each calendar period', () => {
  const sparse = results.get('below-threshold')!;
  assert.equal(sparse.quality.coverage.recent?.presenceNights, 3);
  assert.equal(sparse.quality.coverage.previous?.presenceNights, 2);
  assert.equal(sparse.summary.weeklyChangeMinutes, null);
  assert.equal(sparse.quality.coverage.comparisonAvailable, false);
  const enough = results.get('at-threshold')!;
  assert.equal(enough.summary.weeklyChangeMinutes, 120);
  assert.equal(enough.quality.coverage.comparisonAvailable, true);
  assert.equal(enough.quality.coverage.minimumNights, 3);
  const reversed = summarizeSleep(coverageCases[2].records.filter(record => record.id !== 4), [], 'UTC');
  assert.equal(reversed.quality.coverage.recent?.presenceNights, 2);
  assert.equal(reversed.summary.weeklyChangeMinutes, null);
});
test('unknown presence and absent records stay distinct, and a known nap cannot fill an unknown main night', () => {
  const result = results.get('unknown-longest-episode')!;
  const report = result.quality.coverage;
  assert.equal(result.episodes.length, 7);
  assert.equal(result.nights.length, 6);
  assert.equal(report.recent?.recordedNights, 3);
  assert.equal(report.recent?.presenceNights, 2);
  assert.equal(report.recent?.days[6].status, 'unknown');
  assert.equal(report.recent?.days[2].status, 'not_returned');
  assert.equal(report.recent?.days[0].status, 'known');
  assert.equal(report.previous?.heartRateNights, 1);
  assert.equal(report.previous?.hrvNights, 0);
  assert.equal(report.previous?.respiratoryRateNights, 1);
  assert.equal(result.summary.weeklyChangeMinutes, null);
  assert.match(report.scopeNote, /does not prove sensor failure or no sleep/);
});
test('coverage uses seven Pod calendar dates across DST and leap days', () => {
  for (const [name, from, through] of [
    ['spring-forward', '2026-03-02', '2026-03-08'],
    ['fall-back', '2026-10-26', '2026-11-01'],
    ['leap-day', '2024-02-24', '2024-03-01'],
  ]) {
    const report = results.get(name)!.quality.coverage;
    assert.equal(report.recent?.from, from);
    assert.equal(report.recent?.through, through);
    assert.equal(new Set([...report.previous!.days, ...report.recent!.days].map(day => day.date)).size, 14);
    assert.equal(report.recent?.days.length, 7);
    assert.equal(report.previous?.days.length, 7);
  }
  assert.ok(results.get('leap-day')!.quality.coverage.recent?.days.some(day => day.date === '2024-02-29'));
});
test('empty ranges have no invented dates, while a measured zero remains known', () => {
  const empty = results.get('empty')!;
  assert.equal(empty.quality.coverage.recent, null);
  assert.equal(empty.quality.coverage.previous, null);
  assert.equal(empty.summary.periodEnding, null);
  const zero = dataCoverage([{ date: '2026-10-14', occupiedMinutes: 0, heartRate: null, hrv: null, respiratoryRate: null }], 'UTC');
  assert.equal(zero.recent?.presenceNights, 1);
  assert.equal(zero.recent?.days[6].status, 'known');
});
test('summary and detail agree on invalid dates, nonpositive durations and the 72-hour boundary', () => {
  const valid = coverageRecord('2026-10-14', 1);
  const invalid = [
    { ...valid, entered_bed_at: NaN }, { ...valid, left_bed_at: Infinity },
    { ...valid, left_bed_at: 1e15 }, { ...valid, left_bed_at: valid.entered_bed_at },
    { ...valid, left_bed_at: valid.entered_bed_at - 1 },
    { ...valid, left_bed_at: valid.entered_bed_at + MAX_EPISODE_SECONDS + 1 },
  ];
  const boundary = { ...valid, id: 2, left_bed_at: valid.entered_bed_at + MAX_EPISODE_SECONDS };
  const result = summarizeSleep([...invalid, valid, boundary], [], 'UTC');
  assert.equal(result.quality.coverage.excludedEpisodes, 6);
  assert.equal(result.episodes.length, 2);
  invalid.forEach(record => assert.throws(() => validateEpisode(record)));
  assert.doesNotThrow(() => validateEpisode(boundary));
});
test('coaching qualifies historical periods, withholds sparse changes and sends aggregate coverage only', () => {
  const result = results.get('below-threshold')!;
  const coaching = localInsights(result);
  assert.match(coaching.observations[0], /recorded period ending 2026-10-14/);
  assert.ok(!coaching.observations.some(observation => observation.includes('changed by')));
  assert.ok(coaching.limitations.some(limitation => limitation.includes('at least 3 nights')));
  const aggregate = coverageForCoaching(result.quality.coverage);
  assert.equal(aggregate.previous?.presenceNights, 2);
  assert.deepEqual(Object.keys(aggregate.recent!).sort(), ['heartRateNights', 'hrvNights', 'presenceNights', 'recordedNights', 'respiratoryRateNights']);
  assert.equal(JSON.stringify(aggregate).includes('2026-10-'), false);
});
test('shared native coverage expectations match the current server contract', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../shared/fixtures/coverage-cases.json', import.meta.url), 'utf8'));
  assert.deepEqual(fixture, [...results.entries()].map(([name, analytics]) => ({ name, analytics })));
});
