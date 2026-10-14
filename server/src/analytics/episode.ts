import { presenceIntervals, summarizeSleep, type SleepObservation, type VitalObservation } from './summary.js';

import { validRecordWindow } from './coverage.js';
export { MAX_EPISODE_SECONDS } from './coverage.js';
export const MAX_EPISODE_SAMPLES = 2880;
export const VITAL_GAP_SECONDS = 15 * 60;
export const vitalMetrics = [
  { key: 'heartRate', field: 'heart_rate', title: 'Heart rate', unit: 'bpm', minimum: 25, maximum: 220 },
  { key: 'hrv', field: 'hrv', title: 'HRV estimate', unit: 'ms', minimum: 1, maximum: 300 },
  { key: 'respiratoryRate', field: 'breathing_rate', title: 'Breathing estimate', unit: '/ min', minimum: 4, maximum: 50 },
] as const;

export class EpisodeRangeError extends Error {}
export function validateEpisode(record: SleepObservation): void {
  if (!validRecordWindow(record.entered_bed_at, record.left_bed_at)) {
    throw new EpisodeRangeError('This episode has invalid times or exceeds the 72-hour detail limit.');
  }
}
const finite = (value: number | null) => value !== null && Number.isFinite(value) ? value : null;
const rounded = (value: number) => Math.round(value * 10) / 10;
export interface VitalPlotPoint { seconds: number; value: number }

// Preserve the original samples; split chart paths at absence, invalid values and long reporting gaps.
export function episodeDetail(record: SleepObservation, observations: VitalObservation[], timeZone: string) {
  validateEpisode(record);
  if (observations.length > MAX_EPISODE_SAMPLES) {
    throw new EpisodeRangeError('This episode exceeds the 2,880-reading detail limit. Use a shorter episode.');
  }
  const intervals = presenceIntervals(record);
  const ordered = observations.filter(sample => Number.isFinite(sample.timestamp)
    && sample.timestamp >= record.entered_bed_at && sample.timestamp <= record.left_bed_at)
    .sort((first, second) => first.timestamp - second.timestamp);
  const intervalFor = (timestamp: number) => intervals.findIndex(([start, end]) => timestamp >= start && timestamp <= end);
  const samples = ordered.map(sample => ({
    at: sample.timestamp,
    heartRate: finite(sample.heart_rate), hrv: finite(sample.hrv), respiratoryRate: finite(sample.breathing_rate),
    present: intervals.length ? intervalFor(sample.timestamp) >= 0 : null,
  }));
  const plots = vitalMetrics.map(metric => {
    const segments: VitalPlotPoint[][] = [];
    let previousTime = -Infinity;
    let previousInterval = -1;
    let current: VitalPlotPoint[] | undefined;
    const values: number[] = [];
    for (const sample of ordered) {
      const value = finite(sample[metric.field]);
      const interval = intervalFor(sample.timestamp);
      if (interval < 0 || value === null || value < metric.minimum || value > metric.maximum) {
        current = undefined;
        continue;
      }
      if (!current || interval !== previousInterval || sample.timestamp - previousTime > VITAL_GAP_SECONDS) {
        current = []; segments.push(current);
      }
      current.push({ seconds: sample.timestamp - record.entered_bed_at, value });
      values.push(value); previousTime = sample.timestamp; previousInterval = interval;
    }
    return {
      key: metric.key, title: metric.title, unit: metric.unit, segments,
      count: values.length,
      average: values.length ? rounded(values.reduce((total, value) => total + value, 0) / values.length) : null,
      minimum: values.length ? Math.min(...values) : null,
      maximum: values.length ? Math.max(...values) : null,
    };
  });
  return {
    side: record.side, timeZone,
    episode: summarizeSleep([record], ordered, timeZone).episodes[0],
    durationSeconds: record.left_bed_at - record.entered_bed_at,
    presenceKnown: intervals.length > 0,
    intervals: intervals.map(([start, end]) => ({ start: start - record.entered_bed_at, end: end - record.entered_bed_at })),
    samples, plots,
    notes: [
      'Bed presence is not measured sleep. HRV and breathing are experimental estimates.',
      'Charts include plausible readings during detected presence. Breaks show absence, invalid values or reporting gaps over 15 minutes.',
      'Recorded readings retain excluded values. Missing readings are not zero.',
    ],
  };
}
export type EpisodeDetail = ReturnType<typeof episodeDetail>;
