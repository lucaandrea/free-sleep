import { Accessory, Characteristic, HAPStatus, HapStatusError, Service, uuid } from 'hap-nodejs';
import type { DeepPartial } from 'ts-essentials';
import { BASE_PRESETS, type BasePosition } from '../../base/types.js';
import type { DeviceStatus, SideStatus } from '../../routes/deviceStatus/deviceStatusSchema.js';
import { communicationError, HomeKitStatusReader } from './status.js';

export interface HomeKitHardware {
  read: () => Promise<DeviceStatus>;
  update: (update: DeepPartial<DeviceStatus>) => Promise<unknown>;
  move: (position: BasePosition) => Promise<unknown>;
  stop: () => Promise<unknown>;
}

export const fahrenheitToCelsius = (temperature: number) => ((temperature - 32) * 5) / 9;
export const celsiusToFahrenheit = (temperature: number) => (temperature * 9) / 5 + 32;

// The Pod reports temperature and target, not compressor activity; this is a demand estimate.
function heatingState(side: SideStatus) {
  if (!side.isOn || side.targetTemperatureF === side.currentTemperatureF) return 0;
  return side.targetTemperatureF > side.currentTemperatureF ? 1 : 2;
}

export function createHomeKitAccessories(identity: string, hardware: HomeKitHardware) {
  const reader = new HomeKitStatusReader(hardware.read);
  const resets = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;

  function sideAccessory(side: 'left' | 'right') {
    const accessory = new Accessory(`Free Sleep ${side}`, uuid.generate(`${identity}:${side}`));
    const thermostat = accessory.addService(Service.Thermostat, `${side === 'left' ? 'Left' : 'Right'} bed`);
    thermostat.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(async () => fahrenheitToCelsius((await reader.read())[side].currentTemperatureF));
    const target = thermostat.getCharacteristic(Characteristic.TargetTemperature);
    // HAP's initial 10°C value is outside the Pod range; the first GET supplies the actual target.
    target.value = null;
    target.setProps({ minValue: 12.5, maxValue: 43.5, minStep: 0.5 })
      .onGet(async () => fahrenheitToCelsius((await reader.read())[side].targetTemperatureF))
      .onSet(async value => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 12.5 || value > 43.5) {
          throw new HapStatusError(HAPStatus.INVALID_VALUE_IN_REQUEST);
        }
        await reader.write(() => hardware.update({
          [side]: { targetTemperatureF: Math.min(110, Math.max(55, celsiusToFahrenheit(value))) },
        }));
      });
    thermostat.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps({ validValues: [0, 3] })
      .onGet(async () => ((await reader.read())[side].isOn ? 3 : 0))
      .onSet(async value => {
        if (value !== 0 && value !== 3) throw new HapStatusError(HAPStatus.INVALID_VALUE_IN_REQUEST);
        await reader.write(() => hardware.update({ [side]: { isOn: value === 3 } }));
      });
    thermostat.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .onGet(async () => heatingState((await reader.read())[side]));
    thermostat.getCharacteristic(Characteristic.TemperatureDisplayUnits).onGet(() => 1);
    return accessory;
  }

  function actionAccessory(name: string, action: () => Promise<unknown>) {
    const accessory = new Accessory(name, uuid.generate(`${identity}:${name}`));
    const service = accessory.addService(Service.Switch, name);
    let pending: Promise<void> | undefined;
    service.getCharacteristic(Characteristic.On).onGet(() => false).onSet(async value => {
      reader.assertActive();
      if (value === false) return;
      if (value !== true) throw new HapStatusError(HAPStatus.INVALID_VALUE_IN_REQUEST);
      if (pending) return pending;
      // A repeated tap shares the pending action; each switch, including Stop, remains independent.
      pending = Promise.resolve().then(() => {
        reader.assertActive();
        return action();
      }).then(() => undefined).catch(error => { throw communicationError(error); });
      try {
        await pending;
      } finally {
        pending = undefined;
        if (!disposed) {
          const timer = setTimeout(() => {
            resets.delete(timer);
            service.updateCharacteristic(Characteristic.On, false);
          }, 100);
          resets.add(timer);
          timer.unref();
        }
      }
    });
    return accessory;
  }

  const thermostats = [sideAccessory('left'), sideAccessory('right')];
  const accessories = [...thermostats];
  for (const [preset, position] of Object.entries(BASE_PRESETS)) {
    accessories.push(actionAccessory(`Bed ${preset}`, () => hardware.move(position)));
  }
  accessories.push(actionAccessory('Stop bed movement', hardware.stop));
  accessories.push(actionAccessory('Prime Pod', () => reader.write(() => hardware.update({ isPriming: true }))));

  async function refresh() {
    try {
      const status = await reader.read();
      if (!reader.isCurrent(status)) return;
      for (const [index, side] of (['left', 'right'] as const).entries()) {
        const service = thermostats[index].getService(Service.Thermostat)!;
        service.updateCharacteristic(Characteristic.CurrentTemperature, fahrenheitToCelsius(status[side].currentTemperatureF));
        service.updateCharacteristic(Characteristic.TargetTemperature, fahrenheitToCelsius(status[side].targetTemperatureF));
        service.updateCharacteristic(Characteristic.TargetHeatingCoolingState, status[side].isOn ? 3 : 0);
        service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, heatingState(status[side]));
      }
    } catch (error) {
      if (disposed) return;
      for (const accessory of thermostats) {
        const service = accessory.getService(Service.Thermostat)!;
        for (const characteristic of [Characteristic.CurrentTemperature, Characteristic.TargetTemperature,
          Characteristic.TargetHeatingCoolingState, Characteristic.CurrentHeatingCoolingState]) {
          service.getCharacteristic(characteristic).updateValue(communicationError(error));
        }
      }
    }
  }

  return {
    accessories,
    refresh,
    dispose() {
      disposed = true;
      reader.dispose();
      for (const timer of resets) clearTimeout(timer);
      resets.clear();
    },
  };
}
