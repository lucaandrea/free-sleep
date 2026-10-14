
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="9725925e-2912-5666-a8be-1b755933ba11")}catch(e){}}();
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { healthPresenceRecord } from './healthPresenceRecord.js';
export const healthExportQuery = z.object({
    side: z.enum(['left', 'right']),
    kind: z.enum(['presence', 'heart']),
    startTime: z.string().datetime({ offset: true }),
    endTime: z.string().datetime({ offset: true }),
    afterId: z.coerce.number().int().nonnegative().default(0),
}).refine(query => {
    const duration = Date.parse(query.endTime) - Date.parse(query.startTime);
    return duration > 0 && duration <= 90 * 86400000;
}, 'Choose a range of at most 90 days');
const router = express.Router();
// Cursor pagination keeps large HealthKit exports below the gateway's response limit.
router.get('/export', async (request, response) => {
    const parsed = healthExportQuery.safeParse(request.query);
    if (!parsed.success)
        return response.status(400).json({ error: { message: 'Choose a valid side, kind and Health export range' } });
    const query = parsed.data;
    const start = Math.floor(Date.parse(query.startTime) / 1000);
    const end = Math.floor(Date.parse(query.endTime) / 1000);
    const limit = query.kind === 'presence' ? 50 : 500;
    if (query.kind === 'heart') {
        const records = await prisma.vitals.findMany({
            where: { side: query.side, id: { gt: query.afterId }, timestamp: { gte: start, lte: end } },
            orderBy: { id: 'asc' }, take: limit,
        });
        return response.json({ records: records.map(record => ({ id: record.id,
                timestamp: new Date(record.timestamp * 1000).toISOString(), heart_rate: record.heart_rate })),
            nextCursor: records.length === limit ? records.at(-1).id : null });
    }
    const records = await prisma.sleep_records.findMany({
        where: { side: query.side, id: { gt: query.afterId }, left_bed_at: { gte: start }, entered_bed_at: { lte: end } },
        orderBy: { id: 'asc' }, take: limit,
    });
    response.json({ records: records.map(healthPresenceRecord), nextCursor: records.length === limit ? records.at(-1).id : null });
});
export default router;
//# sourceMappingURL=healthExport.js.map
//# debugId=9725925e-2912-5666-a8be-1b755933ba11
