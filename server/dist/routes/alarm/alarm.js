
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="9f47310e-6517-5d2b-8499-80dd60586223")}catch(e){}}();
import express from 'express';
import { AlarmJobSchema, SideSchema, } from '../../db/schedulesSchema.js';
import logger from '../../logger.js';
import schedulesDB from '../../db/schedules.js';
import { executeAlarm } from '../../jobs/alarmScheduler.js';
import settingsDB, { updateSettings } from '../../db/settings.js';
import { AlarmChangeSchema } from '../../alarms/schema.js';
import { changeAlarm, previewAlarm } from '../../alarms/timing.js';
import { AlarmChangeError } from '../../alarms/overrides.js';
const router = express.Router();
router.get('/alarm/next', async (req, res) => {
    const side = SideSchema.safeParse(req.query.side);
    if (!side.success) {
        res.status(400).json({ error: { message: 'Choose a valid bed side.' } });
        return;
    }
    await Promise.all([settingsDB.read(), schedulesDB.read()]);
    res.json(previewAlarm(settingsDB.data, schedulesDB.data, side.data));
});
router.post('/alarm/override', async (req, res) => {
    const input = AlarmChangeSchema.safeParse(req.body);
    if (!input.success) {
        res.status(400).json({ error: { message: 'Choose a valid alarm action and 24-hour time.' } });
        return;
    }
    try {
        const preview = await updateSettings(async (settings) => {
            await schedulesDB.read();
            settings[input.data.side].scheduleOverrides.alarm = changeAlarm(settings, schedulesDB.data, input.data);
            return previewAlarm(settings, schedulesDB.data, input.data.side);
        });
        res.json(preview);
    }
    catch (error) {
        if (error instanceof AlarmChangeError)
            res.status(409).json({ error: { message: error.message } });
        else {
            logger.error(error);
            res.status(500).json({ error: { message: 'Unable to save the alarm. Please try again.' } });
        }
    }
});
router.post('/alarm', async (req, res) => {
    const body = req.body;
    const validationResult = AlarmJobSchema.safeParse(body);
    if (!validationResult.success) {
        logger.error('Invalid schedules update:', validationResult.error);
        res.status(400).json({
            error: 'Invalid request data',
            details: validationResult?.error?.errors,
        });
        return;
    }
    const alarmJob = validationResult.data;
    void executeAlarm(alarmJob);
    res.status(200).json(schedulesDB.data);
});
export default router;
//# sourceMappingURL=alarm.js.map
//# debugId=9f47310e-6517-5d2b-8499-80dd60586223
