
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="ee6d5fea-55e0-5570-9b8b-36c895f8bede")}catch(e){}}();
import express from 'express';
import schedulesDB, { updateSchedules } from '../../db/schedules.js';
import { SchedulesSchema } from '../../db/schedulesSchema.js';
import { applyRoutine, RoutineConflict, RoutineSaveSchema, RoutineValidationError } from '../../routines/contract.js';
import logger from '../../logger.js';
const router = express.Router();
router.get('/schedules', async (_request, response) => {
    await schedulesDB.read();
    response.json(schedulesDB.data);
});
router.post('/schedules/routine', async (request, response) => {
    const input = RoutineSaveSchema.safeParse(request.body);
    if (!input.success) {
        response.status(400).json({ error: { message: 'Choose valid routine values and target days.' } });
        return;
    }
    try {
        const result = await updateSchedules((schedules) => {
            applyRoutine(schedules, input.data);
            return schedules;
        });
        response.json(result);
    }
    catch (error) {
        if (error instanceof RoutineConflict || error instanceof RoutineValidationError) {
            response.status(error instanceof RoutineConflict ? 409 : 400).json({ error: { message: error.message } });
        }
        else {
            logger.error(error);
            response.status(500).json({ error: { message: 'Unable to save the routine. Please try again.' } });
        }
    }
});
// Partial writes retain omitted alarm/power fields; an explicit temperature map replaces that map.
router.post('/schedules', async (request, response) => {
    const input = SchedulesSchema.deepPartial().safeParse(request.body);
    if (!input.success) {
        response.status(400).json({ error: { message: 'Choose valid routine values.' } });
        return;
    }
    const result = await updateSchedules((schedules) => {
        for (const side of Object.keys(input.data)) {
            for (const day of Object.keys(input.data[side])) {
                const change = input.data[side][day];
                const current = schedules[side][day];
                if (change.power)
                    Object.assign(current.power, change.power);
                if (change.alarm)
                    Object.assign(current.alarm, change.alarm);
                if (change.temperatures)
                    current.temperatures = change.temperatures;
            }
        }
        return schedules;
    });
    response.json(result);
});
export default router;
//# sourceMappingURL=schedules.js.map
//# debugId=ee6d5fea-55e0-5570-9b8b-36c895f8bede
