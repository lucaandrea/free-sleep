
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="a1d317b8-3694-55f7-8293-8382ed698add")}catch(e){}}();
import express from 'express';
import moment from 'moment-timezone';
import { sleepMutations } from '../../records/router.js';
import { loadSleepRecords } from '../../db/loadSleepRecords.js';
import { prisma } from '../../db/prisma.js';
const router = express.Router();
router.get('/sleep', async (req, res) => {
    const { startTime, endTime, side } = req.query;
    const query = {
        entered_bed_at: {},
        left_bed_at: {},
    };
    if (side)
        query.side = side;
    if (startTime) {
        query.left_bed_at = {
            gte: moment(startTime).unix(),
        };
    }
    if (endTime) {
        query.entered_bed_at = {
            lte: moment(endTime).unix(),
        };
    }
    const sleepRecords = await prisma.sleep_records.findMany({
        where: query,
        orderBy: { entered_bed_at: 'asc' },
    });
    const formattedRecords = await loadSleepRecords(sleepRecords);
    res.json(formattedRecords);
});
router.use('/sleep', sleepMutations(prisma));
export default router;
//# sourceMappingURL=sleep.js.map
//# debugId=a1d317b8-3694-55f7-8293-8382ed698add
