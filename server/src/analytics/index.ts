import { sleepMutations } from '../records/router.js';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import settingsDB from '../db/settings.js';
import { summarizeSleep } from './summary.js';
import { episodeRoutes } from './episodeRoutes.js';
import { MAX_EPISODE_SAMPLES } from './episode.js';
import { analyticsQuery } from './query.js';
export { analyticsQuery } from './query.js';
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
router.use('/episodes', sleepMutations(prisma));
router.use(episodeRoutes({
  record: (id, side) => prisma.sleep_records.findFirst({ where: { id, side } }),
  vitals: record => prisma.vitals.findMany({
    where: { side: record.side, timestamp: { gte: record.entered_bed_at, lte: record.left_bed_at } },
    orderBy: { timestamp: 'asc' }, take: MAX_EPISODE_SAMPLES + 1,
  }),
  timeZone: async () => { await settingsDB.read(); return settingsDB.data.timeZone || 'UTC'; },
}));
router.get('/', async (request, response) => {
  const query = analyticsQuery.safeParse(request.query);
  if (!query.success) return response.status(400).json({ error: { message: 'Invalid analytics range or side' } });
  response.json(await loadAnalytics(query.data));
});
export default router;
