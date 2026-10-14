import express from 'express';
import path from 'node:path';
import moment from 'moment-timezone';
import config from '../config.js';
import { analyticsQuery, loadAnalytics } from './index.js';
import { createJournalStore, journalPatterns, journalSchema } from './journal.js';

export const journalStore = createJournalStore(path.join(config.dbFolder, 'analytics', 'journal.json'));
const router = express.Router();
router.get('/', async (request, response) => {
  const query = analyticsQuery.safeParse(request.query);
  if (!query.success) return response.status(400).json({ error: { message: 'Invalid journal side or date range' } });
  const analytics = await loadAnalytics(query.data);
  const dates = analytics.nights.map(night => night.date);
  const since = moment.tz(analytics.timeZone).subtract(query.data.days, 'days').format('YYYY-MM-DD');
  const entries = (await journalStore.list()).filter(entry => entry.side === query.data.side && entry.date >= since);
  response.json({ entries, patterns: journalPatterns(entries.filter(entry => dates.includes(entry.date)), analytics) });
});
router.post('/', async (request, response) => {
  const parsed = journalSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: { message: 'Check the date, rating, and note length' } });
  await journalStore.save(parsed.data);
  response.json(parsed.data);
});
router.delete('/', async (request, response) => {
  const parsed = journalSchema.pick({ side: true, date: true }).safeParse(request.query);
  if (!parsed.success) return response.status(400).json({ error: { message: 'Choose a valid side and date' } });
  await journalStore.remove(parsed.data.side, parsed.data.date);
  response.status(204).end();
});
export default router;
