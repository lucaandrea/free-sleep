
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="8ad07e6d-25eb-5bac-a516-a93b91fb568c")}catch(e){}}();
import express from 'express';
import { z } from 'zod';
import { episodeDetail, EpisodeRangeError, validateEpisode } from './episode.js';
// Keep data access injectable so route tests can prove side/range boundaries without opening a Pod database.
export function episodeRoutes(source) {
    const router = express.Router();
    router.get('/episodes/:id', async (request, response) => {
        const id = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().safe()).safeParse(request.params.id);
        const side = z.enum(['left', 'right']).safeParse(request.query.side);
        if (!id.success || !side.success)
            return response.status(400).json({ error: { message: 'Choose a valid episode and bed side.' } });
        const record = await source.record(id.data, side.data);
        if (record?.side !== side.data) {
            return response.status(404).json({ error: { message: 'This episode is no longer available for this side.' } });
        }
        try {
            validateEpisode(record);
            const [vitals, timeZone] = await Promise.all([source.vitals(record), source.timeZone()]);
            return response.json(episodeDetail(record, vitals, timeZone));
        }
        catch (error) {
            if (error instanceof EpisodeRangeError)
                return response.status(422).json({ error: { message: error.message } });
            throw error;
        }
    });
    return router;
}
//# sourceMappingURL=episodeRoutes.js.map
//# debugId=8ad07e6d-25eb-5bac-a516-a93b91fb568c
