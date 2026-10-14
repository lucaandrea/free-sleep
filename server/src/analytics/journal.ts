import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import moment from 'moment-timezone';
import { z } from 'zod';
import type { SleepAnalytics } from './summary.js';

export const journalSchema = z.object({
  date: z.string().refine(value => moment(value, 'YYYY-MM-DD', true).isValid(), 'Use a valid wake date'),
  side: z.enum(['left', 'right']),
  restfulness: z.number().int().min(1).max(5),
  comfort: z.enum(['cold', 'comfortable', 'warm']),
  caffeine: z.boolean(),
  alcohol: z.boolean(),
  exercise: z.boolean(),
  notes: z.string().trim().max(500).default(''),
}).strict();
export type JournalEntry = z.infer<typeof journalSchema>;

// Serialize writes and atomically replace the file; malformed existing data is never silently reset.
export function createJournalStore(filename: string) {
  let tail: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<JournalEntry[]> => {
    try { return z.array(journalSchema).parse(JSON.parse(await readFile(filename, 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  };
  const update = (transform: (entries: JournalEntry[]) => JournalEntry[]) => {
    const operation = tail.then(async () => {
      const entries = transform(await read());
      if (entries.length > 7300) throw Object.assign(new Error('Journal limit reached; export older entries first'), { status: 409 });
      await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
      const temporary = `${filename}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(entries), { mode: 0o600 });
      await rename(temporary, filename);
      return entries;
    });
    tail = operation.catch(() => undefined);
    return operation;
  };
  return {
    list: async () => { await tail; return read(); },
    save: (input: JournalEntry) => {
      const entry = journalSchema.parse(input);
      return update(entries => [...entries.filter(item => item.side !== entry.side || item.date !== entry.date), entry]
        .sort((first, second) => first.date.localeCompare(second.date)));
    },
    remove: (side: JournalEntry['side'], date: string) => update(entries => entries.filter(entry => entry.side !== side || entry.date !== date)),
  };
}

// Compare observed groups only after both have enough entries; associations never establish cause.
export function journalPatterns(entries: JournalEntry[], analytics: SleepAnalytics) {
  const byDate = new Map(analytics.nights.map(night => [night.date, night]));
  const matched = entries.filter(entry => byDate.get(entry.date)?.occupiedMinutes != null);
  const associations = (['caffeine', 'alcohol', 'exercise'] as const).flatMap(habit => {
    const withHabit = matched.filter(entry => entry[habit]);
    const withoutHabit = matched.filter(entry => !entry[habit]);
    if (withHabit.length < 5 || withoutHabit.length < 5) return [];
    const average = (group: JournalEntry[]) =>
      group.reduce((total, entry) => total + byDate.get(entry.date)!.occupiedMinutes!, 0) / group.length;
    return [{ habit, withCount: withHabit.length, withoutCount: withoutHabit.length,
      presenceDifferenceMinutes: Math.round(average(withHabit) - average(withoutHabit)) }];
  });
  const recent = [...entries].sort((first, second) => first.date.localeCompare(second.date)).slice(-7);
  return {
    recordedCheckIns: entries.length,
    averageRestfulness: recent.length
      ? Math.round(recent.reduce((total, entry) => total + entry.restfulness, 0) / recent.length * 10) / 10
      : null,
    warmNights: recent.filter(entry => entry.comfort === 'warm').length,
    coldNights: recent.filter(entry => entry.comfort === 'cold').length,
    associations,
    note: 'Self-reported habits are associations, not causes. Each comparison needs at least five recorded nights in both groups.',
  };
}
