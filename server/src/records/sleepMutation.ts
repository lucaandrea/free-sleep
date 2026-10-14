import { z } from 'zod';

export const MAX_RECORD_SECONDS = 72 * 60 * 60;
export const recordSeconds = (value: string) => Math.floor(Date.parse(value) / 1000);
const timestamp = z.string().datetime({ offset: true }).refine(value => {
  const seconds = recordSeconds(value);
  return Number.isSafeInteger(seconds) && seconds >= -2147483648 && seconds <= 2147483647;
}, 'Choose a valid recorded date.');
const windowFields = { entered_bed_at: timestamp, left_bed_at: timestamp };

export const sleepRecordIdentity = z.object({
  side: z.enum(['left', 'right']),
  expected: z.object(windowFields).strict(),
}).strict();
export const sleepRecordChange = sleepRecordIdentity.extend(windowFields).superRefine((value, context) => {
  const duration = recordSeconds(value.left_bed_at) - recordSeconds(value.entered_bed_at);
  if (duration <= 0 || duration > MAX_RECORD_SECONDS) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['left_bed_at'],
      message: 'Choose an end after the start, within a 72-hour window.' });
  }
});
export type SleepRecordIdentity = z.infer<typeof sleepRecordIdentity>;
export type SleepRecordChange = z.infer<typeof sleepRecordChange>;

// Preserve original sensor intervals; only count complete recorded exits inside the new window.
export function exitsInWindow(raw: string, start: number, end: number): number {
  const intervals: unknown = JSON.parse(raw);
  if (!Array.isArray(intervals) || !intervals.every(interval => Array.isArray(interval) && interval.length === 2
    && interval.every(Number.isFinite) && interval[1] >= interval[0])) {
    throw new Error('Recorded exit intervals are unavailable. This record cannot be edited.');
  }
  return intervals.filter(([from, until]) => from >= start && until <= end).length;
}
