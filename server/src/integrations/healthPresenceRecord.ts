import { presenceIntervals, type SleepObservation } from '../analytics/summary.js';

// Health reconciliation must distinguish an empty interval list from damaged source data.
export function healthPresenceRecord(record: SleepObservation) {
  let valid = false;
  try {
    const intervals: unknown = JSON.parse(record.present_intervals || '');
    const validTimestamp = (value: unknown): value is number => typeof value === 'number'
      && Number.isFinite(value) && Math.abs(value) <= 8.64e12;
    valid = validTimestamp(record.entered_bed_at) && validTimestamp(record.left_bed_at)
      && record.left_bed_at >= record.entered_bed_at && Array.isArray(intervals)
      && intervals.every(interval => Array.isArray(interval) && interval.length === 2
        && interval.every(validTimestamp) && interval[1] > interval[0]);
  } catch { /* Keep corrupt data distinguishable from an intentionally empty export. */ }
  return { id: record.id, valid,
    present_intervals: valid ? presenceIntervals(record).map(([begin, finish]) =>
      [new Date(begin * 1000).toISOString(), new Date(finish * 1000).toISOString()]) : [] };
}
