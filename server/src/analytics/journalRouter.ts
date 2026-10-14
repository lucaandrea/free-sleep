import express from 'express';
import moment from 'moment-timezone';
import { z } from 'zod';
import { analyticsQuery } from './query.js';
import { journalPatterns, journalSchema, type createJournalStore, type JournalEntry } from './journal.js';
import type { SleepAnalytics } from './summary.js';

export const journalQuery = analyticsQuery.extend({ date: journalSchema.shape.date.optional() });
export type JournalQuery = z.infer<typeof journalQuery>;

// The selected date is independent of the trend window, so older entries cannot look empty.
export function journalResponse(all: JournalEntry[], query: JournalQuery, analytics: SleepAnalytics, now = Date.now()) {
  const since = moment.tz(now, analytics.timeZone).subtract(query.days, 'days').format('YYYY-MM-DD');
  const scoped = all.filter(entry => entry.side === query.side);
  const entries = scoped.filter(entry => entry.date >= since);
  const dates = new Set(analytics.nights.map(night => night.date));
  return {
    entries, selectedDate: query.date ?? null, selected: query.date ? scoped.find(entry => entry.date === query.date) ?? null : null,
    timeZone: analytics.timeZone,
    patterns: journalPatterns(entries.filter(entry => dates.has(entry.date)), analytics),
  };
}

export function journalRouter(store: ReturnType<typeof createJournalStore>, analytics: (query: JournalQuery) => Promise<SleepAnalytics>) {
  const router = express.Router();
  router.get('/', async (request, response) => {
    const query = journalQuery.safeParse(request.query);
    if (!query.success) return response.status(400).json({ error: { message: 'Choose a valid journal side, wake date and range' } });
    response.json(journalResponse(await store.list(), query.data, await analytics(query.data)));
  });
  router.post('/', async (request, response) => {
    const parsed = journalSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: { message: 'Check the date, rating, and note length' } });
    await store.save(parsed.data);
    response.json(parsed.data);
  });
  router.delete('/', async (request, response) => {
    const parsed = journalSchema.pick({ side: true, date: true }).safeParse(request.query);
    if (!parsed.success) return response.status(400).json({ error: { message: 'Choose a valid side and date' } });
    await store.remove(parsed.data.side, parsed.data.date);
    response.status(204).end();
  });
  return router;
}
