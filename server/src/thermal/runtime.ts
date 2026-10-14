import express from 'express';
import path from 'node:path';
import { z } from 'zod';
import config from '../config.js';
import logger from '../logger.js';
import settingsDB from '../db/settings.js';
import schedulesDB from '../db/schedules.js';
import { connectedFranken } from '../8sleep/frankenServer.js';
import { journalStore } from '../analytics/journalRoutes.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import { ComfortController } from './controller.js';
import { comfortStore } from './store.js';
import { comfortConfigSchema } from './types.js';
import { presenceMonitor } from './presence.js';
import { registerComfortController } from './coordinator.js';

export const comfortController = new ComfortController(comfortStore(path.join(config.dbFolder, 'analytics', 'comfort.json')), async () => {
  const connection = connectedFranken();
  if (!connection) throw new Error('Pod unavailable');
  await settingsDB.read();
  await schedulesDB.read();
  const journal = await journalStore.list();
  const device = await connection.getDeviceStatus();
  return { settings: structuredClone(settingsDB.data), schedules: structuredClone(schedulesDB.data), journal, device,
    observedAt: Date.now(), presence: presenceMonitor.read() };
});
let timer: NodeJS.Timeout | undefined;
let checking = false;
export function startComfort() {
  registerComfortController((command, source, apply, assertCurrent) => comfortController.execute(command, source, apply, assertCurrent));
  if (timer) return;
  timer = setInterval(() => {
    if (checking) return;
    checking = true;
    void updateDeviceStatus({}, 'adaptive').catch(error => logger.warn(`Adaptive comfort check failed: ${String(error)}`))
      .finally(() => { checking = false; });
  }, 30_000);
  timer.unref();
}
export function stopComfort() { comfortController.stop(); if (timer) clearInterval(timer); timer = undefined; }

const router = express.Router();
const sideSchema = z.enum(['left', 'right']);
router.get('/', async (request, response) => {
  const side = sideSchema.safeParse(request.query.side);
  if (!side.success) return response.status(400).json({ error: { message: 'Choose left or right' } });
  response.json(await comfortController.status(side.data));
});
router.post('/', async (request, response) => {
  const parsed = z.object({ side: sideSchema, config: comfortConfigSchema, reset: z.boolean().optional() }).strict().safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: { message: 'Choose a mode and limits between 55 and 110°F, with minimum below maximum' } });
  }
  await comfortController.configure(parsed.data.side, parsed.data.config, parsed.data.reset);
  response.json(await comfortController.status(parsed.data.side));
});
export default router;
