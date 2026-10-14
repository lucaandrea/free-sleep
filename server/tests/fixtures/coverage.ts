import moment from 'moment-timezone';
import type { SleepObservation, VitalObservation } from '../../src/analytics/summary.js';

export function coverageRecord(date: string, id: number, minutes = 480, timeZone = 'UTC', known = true): SleepObservation {
  const end = moment.tz(`${date}T08:00:00`, timeZone).unix();
  const start = end - minutes * 60;
  return { id, side: 'left', entered_bed_at: start, left_bed_at: end, times_exited_bed: 0,
    present_intervals: known ? JSON.stringify([[start, end]]) : '[]' };
}
const thresholdDates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-08', '2026-10-09', '2026-10-14'];
const threshold = thresholdDates.map((date, index) => coverageRecord(date, index + 1, index < 3 ? 360 : 480));
const springDates = ['2026-02-28', '2026-03-01', '2026-03-02', '2026-03-06', '2026-03-07', '2026-03-08'];
const fallDates = ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-30', '2026-10-31', '2026-11-01'];
const leapDates = ['2024-02-22', '2024-02-23', '2024-02-24', '2024-02-28', '2024-02-29', '2024-03-01'];
interface CoverageCase { name: string; timeZone: string; records: SleepObservation[]; vitals: VitalObservation[] }
export const coverageCases: CoverageCase[] = [
  { name: 'empty', timeZone: 'UTC', records: [], vitals: [] },
  { name: 'below-threshold', timeZone: 'UTC', records: threshold.filter(record => record.id !== 3), vitals: [] },
  { name: 'at-threshold', timeZone: 'UTC', records: threshold, vitals: [] },
  { name: 'unknown-longest-episode', timeZone: 'UTC', records: [
    ...threshold.filter(record => record.id !== 6),
    coverageRecord('2026-10-14', 6, 540, 'UTC', false), coverageRecord('2026-10-14', 7, 30),
  ], vitals: [{ timestamp: threshold[0].entered_bed_at + 600, heart_rate: 60, hrv: null, breathing_rate: 15 }] },
  { name: 'spring-forward', timeZone: 'America/Los_Angeles', records: springDates.map((date, index) =>
    coverageRecord(date, index + 1, 480, 'America/Los_Angeles')), vitals: [] },
  { name: 'fall-back', timeZone: 'America/Los_Angeles', records: fallDates.map((date, index) =>
    coverageRecord(date, index + 1, 480, 'America/Los_Angeles')), vitals: [] },
  { name: 'leap-day', timeZone: 'Asia/Kathmandu', records: leapDates.map((date, index) =>
    coverageRecord(date, index + 1, 480, 'Asia/Kathmandu')), vitals: [] },
];
