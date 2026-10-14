import express from 'express';
import { z } from 'zod';
import type { SleepObservation, VitalObservation } from './summary.js';
import { episodeDetail, EpisodeRangeError, validateEpisode } from './episode.js';

export interface EpisodeSource {
  record(id: number, side: 'left' | 'right'): Promise<SleepObservation | null>;
  vitals(record: SleepObservation): Promise<VitalObservation[]>;
  timeZone(): Promise<string>;
}
// Keep data access injectable so route tests can prove side/range boundaries without opening a Pod database.
export function episodeRoutes(source: EpisodeSource) {
  const router = express.Router();
  router.get('/episodes/:id', async (request, response) => {
    const id = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().safe()).safeParse(request.params.id);
    const side = z.enum(['left', 'right']).safeParse(request.query.side);
    if (!id.success || !side.success) return response.status(400).json({ error: { message: 'Choose a valid episode and bed side.' } });
    const record = await source.record(id.data, side.data);
    if (record?.side !== side.data) {
      return response.status(404).json({ error: { message: 'This episode is no longer available for this side.' } });
    }
    try {
      validateEpisode(record);
      const [vitals, timeZone] = await Promise.all([source.vitals(record), source.timeZone()]);
      return response.json(episodeDetail(record, vitals, timeZone));
    } catch (error) {
      if (error instanceof EpisodeRangeError) return response.status(422).json({ error: { message: error.message } });
      throw error;
    }
  });
  return router;
}
