
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="b0648e5e-5687-5d6d-b476-7a15e9edc815")}catch(e){}}();
import _ from 'lodash';
import cbor from 'cbor';
import { executeFunction } from '../../8sleep/deviceApi.js';
import logger from '../../logger.js';
import settingsDB from '../../db/settings.js';
import memoryDB from '../../db/memoryDB.js';
import { INVERTED_SETTINGS_KEY_MAPPING } from '../../8sleep/loadDeviceStatus.js';
import { coordinateTemperature } from '../../thermal/coordinator.js';
import { connectedFranken } from '../../8sleep/frankenServer.js';
const calculateLevelFromF = (temperatureF) => {
    const level = (temperatureF - 82.5) / 27.5 * 100;
    return Math.round(level).toString();
};
const updateSide = async (side, sideStatus, execute = executeFunction, adaptive = false) => {
    await settingsDB.read();
    const settings = settingsDB.data;
    if (adaptive && (settings.left.awayMode || settings.right.awayMode))
        throw new Error('Away mode changed before adaptive dispatch');
    if (adaptive) {
        await memoryDB.read();
        if (memoryDB.data[side].isAlarmVibrating)
            throw new Error('An alarm started before adaptive dispatch');
    }
    if (side === 'left') {
        if (settings.left.awayMode) {
            logger.warn('Left side is in away mode, not updating side');
        }
    }
    else {
        if (settings.right.awayMode) {
            logger.warn('Right side is in away mode, not updating side');
        }
    }
    const controlBothSides = settings.left.awayMode || settings.right.awayMode;
    const updateLeft = side === 'left' || controlBothSides;
    const updateRight = side === 'right' || controlBothSides;
    const { isOn, targetTemperatureF, secondsRemaining, isAlarmVibrating } = sideStatus;
    if (controlBothSides) {
        logger.debug('One side is in away mode, updating both sides...');
    }
    if (isOn !== undefined) {
        const onDuration = isOn ? '43200' : '0';
        if (updateLeft)
            await execute('LEFT_TEMP_DURATION', onDuration);
        if (updateRight)
            await execute('RIGHT_TEMP_DURATION', onDuration);
    }
    if (targetTemperatureF) {
        const level = calculateLevelFromF(targetTemperatureF);
        if (updateLeft)
            await execute('TEMP_LEVEL_LEFT', level);
        if (updateRight)
            await execute('TEMP_LEVEL_RIGHT', level);
    }
    if (secondsRemaining) {
        const seconds = Math.round(secondsRemaining).toString();
        if (updateLeft)
            await execute('LEFT_TEMP_DURATION', seconds);
        if (updateRight)
            await execute('RIGHT_TEMP_DURATION', seconds);
    }
    if (isAlarmVibrating !== undefined) {
        logger.debug('Can only set isAlarmVibrating to false for now...');
        if (!isAlarmVibrating)
            await execute('ALARM_CLEAR', 'empty');
        await memoryDB.read();
        memoryDB.data[side].isAlarmVibrating = false;
        await memoryDB.write();
    }
};
const updateSettings = async (settings, execute = executeFunction) => {
    const renamedSettings = _.mapKeys(settings, (value, key) => INVERTED_SETTINGS_KEY_MAPPING[key] || key);
    const encodedBuffer = cbor.encode(renamedSettings);
    const hexString = encodedBuffer.toString('hex');
    await execute('SET_SETTINGS', hexString);
};
export const updateDeviceStatus = async (deviceStatus, source = 'manual', assertCurrent) => coordinateTemperature(deviceStatus, source, async (update, notAfter) => {
    assertCurrent?.();
    const connection = notAfter !== undefined ? connectedFranken() : undefined;
    if (notAfter !== undefined && !connection)
        throw new Error('Adaptive comfort requires an existing Pod connection');
    const execute = connection
        ? (command, argument = 'empty') => connection.callFunction(command, argument, notAfter, assertCurrent)
        : (command, argument = 'empty') => executeFunction(command, argument, assertCurrent);
    logger.info(`Updating device status..`);
    if (update.isPriming)
        await execute('PRIME');
    if (update?.left)
        await updateSide('left', update.left, execute, notAfter !== undefined);
    if (update?.right)
        await updateSide('right', update.right, execute, notAfter !== undefined);
    if (update?.settings)
        await updateSettings(update.settings, execute);
    logger.info('Finished updating device status');
}, assertCurrent);
//# sourceMappingURL=updateDeviceStatus.js.map
//# debugId=b0648e5e-5687-5d6d-b476-7a15e9edc815
