import type { DeviceStatus } from '../../src/routes/deviceStatus/deviceStatusSchema.js';

export function deviceStatusFixture(): DeviceStatus {
  const side = { currentTemperatureLevel: 0, currentTemperatureF: 77, targetTemperatureF: 86,
    secondsRemaining: 300, isOn: true, isAlarmVibrating: false };
  return { left: { ...side }, right: { ...side, currentTemperatureF: 80.6, targetTemperatureF: 73.4 },
    waterLevel: 'full', isPriming: false, settings: { v: 1, gainLeft: 1, gainRight: 1, ledBrightness: 50 },
    coverVersion: 'test', hubVersion: 'test', freeSleep: { version: 'test', branch: 'test' }, wifiStrength: -45 };
}
