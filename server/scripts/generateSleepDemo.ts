import { readFile, writeFile } from 'node:fs/promises';
import { episodeDetail } from '../src/analytics/episode.js';
import { summarizeSleep } from '../src/analytics/summary.js';
import { localInsights } from '../src/ai/coach.js';

// Fixed, synthetic dates make cross-platform screenshots and decoding tests reproducible.
const anchor = Date.parse('2026-10-13T06:00:00Z') / 1000;
const records = Array.from({ length: 14 }, (_, index) => {
  const start = anchor - (13 - index) * 86400;
  const end = start + [450, 480, 420, 510, 465, 500, 470][index % 7] * 60;
  return { id: index + 1, side: 'left', entered_bed_at: start, left_bed_at: end, times_exited_bed: 1,
    sleep_period_seconds: end - start, not_present_intervals: JSON.stringify([[start + 3 * 3600, start + 3.25 * 3600]]),
    present_intervals: JSON.stringify([[start, start + 3 * 3600], [start + 3.25 * 3600, end]]) };
});
records.push({ id: 15, side: 'left', entered_bed_at: anchor + 14 * 3600, left_bed_at: anchor + 14 * 3600 + 2400,
  times_exited_bed: 0, sleep_period_seconds: 2400, not_present_intervals: '[]',
  present_intervals: JSON.stringify([[anchor + 14 * 3600, anchor + 14 * 3600 + 2100]]) });
const vitals = records.flatMap(record => Array.from({ length: Math.floor((record.left_bed_at - record.entered_bed_at) / 300) }, (_, index) => ({
  timestamp: record.entered_bed_at + index * 300,
  heart_rate: index === 21 ? 999 : index === 20 ? null : 54 + index % 8,
  hrv: index % 9 === 0 ? null : 40 + index % 12, breathing_rate: 14 + index % 3,
})).filter((_, index) => index < 50 || index > 55));
const data = {
  anchor, records, vitals,
  analytics: summarizeSleep(records, vitals, 'America/Los_Angeles'),
  ranges: Object.fromEntries([7, 30, 90].map(days => [days, summarizeSleep(records.filter(record =>
    record.entered_bed_at >= anchor - (days - 1) * 86400), vitals, 'America/Los_Angeles')])),
  details: Object.fromEntries(records.map(record => [record.id, episodeDetail(record,
    vitals.filter(sample => sample.timestamp >= record.entered_bed_at && sample.timestamp <= record.left_bed_at), 'America/Los_Angeles')])),
};
const target = new URL('../../shared/fixtures/sleep-demo.json', import.meta.url);
const coaching = Object.fromEntries(Object.entries(data.ranges).map(([days, analytics]) => [days, {
  ...localInsights(analytics), provider: 'rules', model: 'Demo insights',
}]));
const content = JSON.stringify({ ...data, coaching }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== content) throw new Error('Regenerate the shared sleep demo fixture.');
  console.log('Shared sleep fixture matches the analytics contract.');
} else { await writeFile(target, content); console.log('Generated the shared sleep fixture.'); }
