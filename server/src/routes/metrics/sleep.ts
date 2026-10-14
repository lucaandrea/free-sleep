import express, { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import moment from 'moment-timezone';
import { sleepMutations } from '../../records/router.js';
import { loadSleepRecords } from '../../db/loadSleepRecords.js';
import { prisma } from '../../db/prisma.js';

const router = express.Router();

// Define query params
interface SleepQuery {
  side?: string;
  startTime?: string;
  endTime?: string;
}


router.get('/sleep', async (req: Request<object, object, object, SleepQuery>, res: Response) => {
  const { startTime, endTime, side } = req.query;
  const query: Prisma.sleep_recordsWhereInput = {
    entered_bed_at: {},
    left_bed_at: {},
  };

  if (side) query.side = side;
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
