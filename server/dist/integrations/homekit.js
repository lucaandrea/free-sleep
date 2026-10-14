
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="eb5e8c52-ce01-50ae-8ad0-cc2db50ffffd")}catch(e){}}();
import path from 'node:path';
import { HAPStorage } from 'hap-nodejs';
import config from '../config.js';
import { connectFranken } from '../8sleep/frankenServer.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import { baseController } from '../base/index.js';
import { HomeKitBridgeController } from './homekit/controller.js';
import { createHomeKitPreparation } from './homekit/identity.js';
const controller = new HomeKitBridgeController({
    enabled: process.env.HOMEKIT_ENABLED === 'true',
    port: Number(process.env.HOMEKIT_PORT || 51826),
    prepare: createHomeKitPreparation(path.join(config.dbFolder, 'homekit'), storage => HAPStorage.setCustomStoragePath(storage)),
    hardware: {
        read: async () => (await connectFranken()).getDeviceStatus(),
        update: update => updateDeviceStatus(update),
        move: position => baseController.move(position),
        stop: () => baseController.stop(),
    },
});
export const startHomeKit = () => controller.start();
export const stopHomeKit = () => controller.stop();
export const homeKitStatus = () => controller.status();
//# sourceMappingURL=homekit.js.map
//# debugId=eb5e8c52-ce01-50ae-8ad0-cc2db50ffffd
