import _ from 'lodash';
import express, { Request, Response } from 'express';
import logger from '../../logger.js';

const router = express.Router();

import settingsDB, { updateSettings } from '../../db/settings.js';
import { SettingsSchema } from '../../db/settingsSchema.js';
import { preferencesRouter } from '../../preferences/router.js';

router.use('/settings/preferences', preferencesRouter({
  read: async () => { await settingsDB.read(); return settingsDB.data; },
  update: updateSettings,
}));

router.get('/settings', async (req: Request, res: Response) => {
  await settingsDB.read();
  res.json(settingsDB.data);
});


router.post('/settings', async (req: Request, res: Response) => {
  const { body } = req;
  const validationResult = SettingsSchema.deepPartial().safeParse(body);
  if (!validationResult.success) {
    logger.error('Invalid settings update:', validationResult.error);
    res.status(400).json({
      error: 'Invalid request data',
      details: validationResult?.error?.errors,
    });
    return;
  }
  const update = validationResult.data;
  delete update.id;
  const result = await updateSettings(settings => {
    // A legacy clock edit replaces absolute occurrence metadata; unrelated partial settings preserve it.
    for (const side of ['left', 'right'] as const) {
      const alarm = update[side]?.scheduleOverrides?.alarm;
      if (alarm && !Object.hasOwn(alarm, 'scheduledAt') && ['timeOverride', 'expiresAt', 'disabled'].some(key => Object.hasOwn(alarm, key))) {
        delete settings[side].scheduleOverrides.alarm.scheduledAt;
        delete settings[side].scheduleOverrides.alarm.replacedAt;
        delete settings[side].scheduleOverrides.alarm.scheduleDay;
        delete settings[side].scheduleOverrides.alarm.revision;
      }
    }
    return _.merge(settings, update);
  });
  res.status(200).json(result);
});


export default router;
