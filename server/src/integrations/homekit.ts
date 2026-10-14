import path from 'node:path';
import config from '../config.js';
import { connectFranken } from '../8sleep/frankenServer.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import { baseController } from '../base/index.js';
import { HomeKitSupervisor } from './homekit/supervisor.js';

const supervisor = new HomeKitSupervisor({
  enabled: process.env.HOMEKIT_ENABLED === 'true',
  configuration: {
    storage: path.join(config.dbFolder, 'homekit'),
    port: Number(process.env.HOMEKIT_PORT || 51826),
    bind: process.env.HOMEKIT_BIND || undefined,
  },
  dispatch: async (command, assertCurrent) => {
    assertCurrent();
    if (command.action === 'read') return (await connectFranken()).getDeviceStatus(false, assertCurrent);
    if (command.action === 'update') await updateDeviceStatus(command.update, 'manual', assertCurrent);
    if (command.action === 'move') await baseController.move(command.position, assertCurrent);
    if (command.action === 'stop') await baseController.stop(assertCurrent);
    return null;
  },
});

export const startHomeKit = () => supervisor.start();
export const stopHomeKit = () => supervisor.stop();
export const homeKitStatus = () => supervisor.status();
