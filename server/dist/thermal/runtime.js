
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="1561bb78-5c42-51d5-9867-7688be18e20d")}catch(e){}}();
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
export const comfortController = new ComfortController(comfortStore(path.join(config.dbFolder, 'analytics', 'comfort.json')), async () => {
    const connection = connectedFranken();
    if (!connection)
        throw new Error('Pod unavailable');
    await settingsDB.read();
    await schedulesDB.read();
    const journal = await journalStore.list();
    const device = await connection.getDeviceStatus();
    return { settings: structuredClone(settingsDB.data), schedules: structuredClone(schedulesDB.data), journal, device,
        observedAt: Date.now(), presence: presenceMonitor.read() };
});
let timer;
let checking = false;
export function startComfort() {
    registerComfortController((command, source, apply, assertCurrent) => comfortController.execute(command, source, apply, assertCurrent));
    if (timer)
        return;
    timer = setInterval(() => {
        if (checking)
            return;
        checking = true;
        void updateDeviceStatus({}, 'adaptive').catch(error => logger.warn(`Adaptive comfort check failed: ${String(error)}`))
            .finally(() => { checking = false; });
    }, 30_000);
    timer.unref();
}
export function stopComfort() { comfortController.stop(); if (timer)
    clearInterval(timer); timer = undefined; }
export default comfortRoutes(comfortController);
//# sourceMappingURL=runtime.js.map
//# debugId=1561bb78-5c42-51d5-9867-7688be18e20d
