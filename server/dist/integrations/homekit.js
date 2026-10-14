
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="156b5772-093c-5184-850b-1c8ffbe14a9b")}catch(e){}}();
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomInt } from 'node:crypto';
import path from 'node:path';
import { Accessory, Bridge, Characteristic, HAPStorage, Service, uuid } from 'hap-nodejs';
import { z } from 'zod';
import config from '../config.js';
import { connectFranken } from '../8sleep/frankenServer.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import { baseController } from '../base/index.js';
import { BASE_PRESETS } from '../base/types.js';
const identitySchema = z.object({ id: z.string().uuid(), username: z.string(), pin: z.string().regex(/^\d{3}-\d{2}-\d{3}$/) });
let bridge = null;
let poll = null;
let errorMessage = null;
let pairingCode = null;
let snapshot = null;
let reading = null;
async function deviceStatus() {
    if (snapshot && Date.now() - snapshot.time < 5000)
        return snapshot.value;
    if (reading)
        return reading;
    reading = (async () => {
        const franken = await connectFranken();
        const value = await franken.getDeviceStatus();
        snapshot = { value, time: Date.now() };
        return value;
    })();
    try {
        return await reading;
    }
    finally {
        reading = null;
    }
}
export const fahrenheitToCelsius = (temperature) => ((temperature - 32) * 5) / 9;
export const celsiusToFahrenheit = (temperature) => (temperature * 9) / 5 + 32;
function sideAccessory(identity, side) {
    const accessory = new Accessory(`Free Sleep ${side}`, uuid.generate(`${identity}:${side}`));
    const thermostat = accessory.addService(Service.Thermostat, `${side === 'left' ? 'Left' : 'Right'} bed`);
    thermostat
        .getCharacteristic(Characteristic.CurrentTemperature)
        .onGet(async () => fahrenheitToCelsius((await deviceStatus())[side].currentTemperatureF));
    thermostat
        .getCharacteristic(Characteristic.TargetTemperature)
        .setProps({ minValue: 12.5, maxValue: 43.5, minStep: 0.5 })
        .onGet(async () => fahrenheitToCelsius((await deviceStatus())[side].targetTemperatureF))
        .onSet(async (value) => {
        await updateDeviceStatus({
            [side]: { targetTemperatureF: Math.min(110, Math.max(55, celsiusToFahrenheit(Number(value)))) },
        });
        snapshot = null;
    });
    thermostat
        .getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .setProps({ validValues: [0, 3] })
        .onGet(async () => ((await deviceStatus())[side].isOn ? 3 : 0))
        .onSet(async (value) => {
        await updateDeviceStatus({ [side]: { isOn: Number(value) === 3 } });
        snapshot = null;
    });
    thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState).onGet(async () => {
        const current = (await deviceStatus())[side];
        return !current.isOn ? 0 : current.targetTemperatureF > current.currentTemperatureF ? 1 : 2;
    });
    thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).onGet(() => 1);
    return accessory;
}
function actionAccessory(identity, name, action) {
    const accessory = new Accessory(name, uuid.generate(`${identity}:${name}`));
    const service = accessory.addService(Service.Switch, name);
    service
        .getCharacteristic(Characteristic.On)
        .onGet(() => false)
        .onSet(async (value) => {
        if (!value)
            return;
        await action();
        setTimeout(() => service.updateCharacteristic(Characteristic.On, false), 100).unref();
    });
    return accessory;
}
export async function stopHomeKit() {
    if (poll)
        clearInterval(poll);
    poll = null;
    pairingCode = null;
    const previous = bridge;
    bridge = null;
    await previous?.unpublish();
}
// Persist the bridge's identity once; restarting must never require re-pairing the home.
export async function startHomeKit() {
    if (process.env.HOMEKIT_ENABLED !== 'true')
        return;
    try {
        const storage = path.join(config.dbFolder, 'homekit');
        await mkdir(storage, { recursive: true, mode: 0o700 });
        HAPStorage.setCustomStoragePath(storage);
        const identityPath = path.join(storage, 'identity.json');
        let identity;
        try {
            identity = identitySchema.parse(JSON.parse(await readFile(identityPath, 'utf8')));
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw new Error('HomeKit identity cannot be read; restore its backup', { cause: error });
            let pinDigits;
            do {
                pinDigits = String(randomInt(10000000, 99999999));
            } while (/^(.)\1{7}$/.test(pinDigits) || ['12345678', '87654321'].includes(pinDigits));
            identity = {
                id: crypto.randomUUID(),
                username: 'C2:' + randomBytes(5).toString('hex').match(/.{2}/g).join(':').toUpperCase(),
                pin: `${pinDigits.slice(0, 3)}-${pinDigits.slice(3, 5)}-${pinDigits.slice(5)}`,
            };
            await writeFile(identityPath, JSON.stringify(identity), { mode: 0o600, flag: 'wx' });
        }
        bridge = new Bridge('Free Sleep', uuid.generate(identity.id));
        bridge
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, 'Free Sleep')
            .setCharacteristic(Characteristic.Model, 'Local Pod bridge')
            .setCharacteristic(Characteristic.SerialNumber, identity.id);
        bridge.addBridgedAccessory(sideAccessory(identity.id, 'left'));
        bridge.addBridgedAccessory(sideAccessory(identity.id, 'right'));
        for (const [preset, position] of Object.entries(BASE_PRESETS)) {
            bridge.addBridgedAccessory(actionAccessory(identity.id, `Bed ${preset}`, () => baseController.move(position)));
        }
        bridge.addBridgedAccessory(actionAccessory(identity.id, 'Stop bed movement', () => baseController.stop()));
        bridge.addBridgedAccessory(actionAccessory(identity.id, 'Prime Pod', () => updateDeviceStatus({ isPriming: true })));
        await bridge.publish({
            username: identity.username,
            pincode: identity.pin,
            category: 2 /* Categories.BRIDGE */,
            port: Number(process.env.HOMEKIT_PORT || 51826),
        });
        pairingCode = identity.pin;
        errorMessage = null;
        poll = setInterval(() => {
            void deviceStatus()
                .then((status) => {
                for (const [index, side] of ['left', 'right'].entries()) {
                    const service = bridge?.bridgedAccessories[index].getService(Service.Thermostat);
                    service?.updateCharacteristic(Characteristic.CurrentTemperature, fahrenheitToCelsius(status[side].currentTemperatureF));
                    service?.updateCharacteristic(Characteristic.TargetTemperature, fahrenheitToCelsius(status[side].targetTemperatureF));
                    service?.updateCharacteristic(Characteristic.TargetHeatingCoolingState, status[side].isOn ? 3 : 0);
                }
            })
                .catch(() => {
                snapshot = null;
            });
        }, 10000);
        poll.unref();
    }
    catch (error) {
        errorMessage = error instanceof Error ? error.message : 'HomeKit unavailable';
        await stopHomeKit();
    }
}
export function homeKitStatus() {
    return {
        enabled: process.env.HOMEKIT_ENABLED === 'true',
        running: bridge !== null && pairingCode !== null,
        pairingCode,
        setupURI: bridge && pairingCode ? bridge.setupURI() : null,
        error: errorMessage,
    };
}
//# sourceMappingURL=homekit.js.map
//# debugId=156b5772-093c-5184-850b-1c8ffbe14a9b
