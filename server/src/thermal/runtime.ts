import path from 'node:path';
import config from '../config.js';
import logger from '../logger.js';
import settingsDB from '../db/settings.js';
import schedulesDB from '../db/schedules.js';
import { connectedFranken } from '../8sleep/frankenServer.js';
import { journalStore } from '../analytics/journalRoutes.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import { ComfortController } from './controller.js';
import { comfortStore } from './store.js';
import { comfortRoutes } from './routes.js';
import { presenceMonitor } from './presence.js';
import { registerComfortController } from './coordinator.js';
import { readAutopilotSignals } from '../autopilot/readSignals.js';

export const comfortController = new ComfortController(comfortStore(path.join(config.dbFolder, 'analytics', 'comfort.json')), async () => {
  const connection = connectedFranken();
  if (!connection) throw new Error('Pod unavailable');
  await settingsDB.read();
  await schedulesDB.read();
  const journal = await journalStore.list();
  const [left, right] = await Promise.all([
    readAutopilotSignals('left').catch(() => undefined), readAutopilotSignals('right').catch(() => undefined),
  ]);
  const device = await connection.getDeviceStatus();
  return { settings: structuredClone(settingsDB.data), schedules: structuredClone(schedulesDB.data), journal, device,
    observedAt: Date.now(), presence: presenceMonitor.read(), signals: { left, right } };
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

export default comfortRoutes(comfortController);
