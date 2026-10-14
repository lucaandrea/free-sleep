import express from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import settingsDB from '../db/settings.js';
import { summarizeSleep } from './summary.js';

export const analyticsQuery = z.object({
  side: z.enum(['left', 'right']).default('left'),
  days: z.coerce.number().int().min(7).max(365).default(30),
  goalMinutes: z.coerce.number().int().min(240).max(720).default(480),
});
export async function loadAnalytics(query: z.infer<typeof analyticsQuery>) {
  const since = Math.floor(Date.now() / 1000) - query.days * 86400;
  const [records, vitals] = await Promise.all([
    prisma.sleep_records.findMany({
      where: { side: query.side, entered_bed_at: { gte: since } },
      orderBy: { entered_bed_at: 'asc' },
    }),
    prisma.vitals.findMany({ where: { side: query.side, timestamp: { gte: since } }, orderBy: { timestamp: 'asc' } }),
  ]);
  await settingsDB.read();
  return summarizeSleep(records, vitals, settingsDB.data.timeZone || 'UTC', query.goalMinutes);
}
const router = express.Router();
router.get('/', async (request, response) => {
  const query = analyticsQuery.safeParse(request.query);
  if (!query.success) return response.status(400).json({ error: { message: 'Invalid analytics range or side' } });
  response.json(await loadAnalytics(query.data));
});
export default router;
