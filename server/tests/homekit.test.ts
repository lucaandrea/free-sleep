import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { Bridge, Characteristic, HAPStatus, HapStatusError, Service, uuid } from 'hap-nodejs';
import type { DeepPartial } from 'ts-essentials';
import { BASE_PRESETS, type BasePosition } from '../src/base/types.js';
import type { DeviceStatus } from '../src/routes/deviceStatus/deviceStatusSchema.js';
import { createHomeKitAccessories, type HomeKitHardware } from '../src/integrations/homekit/accessories.js';
import { HomeKitStatusReader } from '../src/integrations/homekit/status.js';
import { HomeKitBridgeController } from '../src/integrations/homekit/controller.js';
import { createHomeKitPreparation, loadHomeKitIdentity } from '../src/integrations/homekit/identity.js';

const identity = { id: '29b4ecb3-1c21-4fbf-aee1-40b4d70949ba', username: 'C2:AA:BB:CC:DD:EE', pin: '321-54-876' };
const hapError = (status: number) => (error: unknown) => error instanceof HapStatusError && error.hapStatus === status;

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

function hardwareFixture() {
  const side = { currentTemperatureLevel: 0, currentTemperatureF: 77, targetTemperatureF: 86,
    secondsRemaining: 300, isOn: true, isAlarmVibrating: false };
  const status: DeviceStatus = { left: { ...side }, right: { ...side, currentTemperatureF: 80.6, targetTemperatureF: 73.4 },
    waterLevel: 'full', isPriming: false, settings: { v: 1, gainLeft: 1, gainRight: 1, ledBrightness: 50 },
    coverVersion: 'test', hubVersion: 'test', freeSleep: { version: 'test', branch: 'test' }, wifiStrength: -45 };
  const writes: DeepPartial<DeviceStatus>[] = [];
  const moves: BasePosition[] = [];
  let reads = 0;
  let stops = 0;
  const hardware: HomeKitHardware = {
    read: async () => { reads += 1; return structuredClone(status); },
    update: async update => {
      writes.push(structuredClone(update));
      if (update.left) Object.assign(status.left, update.left);
      if (update.right) Object.assign(status.right, update.right);
      if (update.isPriming) status.isPriming = true;
    },
    move: async position => { moves.push(position); },
    stop: async () => { stops += 1; },
  };
  return { hardware, status, writes, moves, get reads() { return reads; }, get stops() { return stops; } };
}

// Real HAP services and handlers, with publication replaced so tests never open a socket or advertise.
class UnpublishedBridge extends Bridge {
  publications = 0;
  removals = 0;
  onPublish = async () => {};
  onUnpublish = async () => {};
  override async publish() { this.publications += 1; await this.onPublish(); }
  override async unpublish() { this.removals += 1; await this.onUnpublish(); }
  override setupURI() { return 'X-HM://TEST-ONLY'; }
  override async destroy(): Promise<void> { throw new Error('Pairing data must never be destroyed'); }
}

function controllerFixture(options: { prepare?: () => Promise<typeof identity>; enabled?: boolean; port?: number } = {}) {
  const sample = hardwareFixture();
  const bridges: UnpublishedBridge[] = [];
  const controller = new HomeKitBridgeController({ enabled: options.enabled ?? true, port: options.port ?? 51826,
    prepare: options.prepare ?? (async () => identity), hardware: sample.hardware,
    createBridge: value => {
      const bridge = new UnpublishedBridge('Free Sleep', uuid.generate(value.id));
      bridges.push(bridge);
      return bridge;
    },
  });
  return { hardware: sample.hardware, controller, bridges };
}

test('HomeKit identity creation is private, atomic and shared by concurrent initializers', async context => {
  const storage = await mkdtemp(path.join(tmpdir(), 'free-sleep-homekit-'));
  context.after(() => rm(storage, { recursive: true, force: true }));
  const identities = await Promise.all(Array.from({ length: 8 }, () => loadHomeKitIdentity(storage)));
  for (const value of identities) assert.deepEqual(value, identities[0]);
  assert.equal((await stat(path.join(storage, 'identity.json'))).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(storage), ['identity.json']);
  const original = await readFile(path.join(storage, 'identity.json'), 'utf8');
  assert.deepEqual(await loadHomeKitIdentity(storage), identities[0]);
  assert.equal(await readFile(path.join(storage, 'identity.json'), 'utf8'), original);
});

test('Invalid existing HomeKit identity is retained and never silently replaced', async context => {
  const storage = await mkdtemp(path.join(tmpdir(), 'free-sleep-homekit-'));
  context.after(() => rm(storage, { recursive: true, force: true }));
  for (const contents of ['broken', JSON.stringify({ ...identity, username: 'broken' }), JSON.stringify({ ...identity, pin: 'invalid' })]) {
    await writeFile(path.join(storage, 'identity.json'), contents);
    await assert.rejects(loadHomeKitIdentity(storage), /restore its backup/);
    assert.equal(await readFile(path.join(storage, 'identity.json'), 'utf8'), contents);
    assert.deepEqual(await readdir(storage), ['identity.json']);
  }
});

test('Restart preparation configures the HAP storage singleton once and rechecks the saved identity', async context => {
  const storage = await mkdtemp(path.join(tmpdir(), 'free-sleep-homekit-'));
  context.after(() => rm(storage, { recursive: true, force: true }));
  const paths: string[] = [];
  const prepare = createHomeKitPreparation(storage, value => {
    if (paths.length) throw new Error('Cannot change storage path after it has already been initialized!');
    paths.push(value);
  });
  const first = await prepare();
  assert.deepEqual(await prepare(), first);
  assert.deepEqual(paths, [storage]);
  await writeFile(path.join(storage, 'identity.json'), 'broken');
  await assert.rejects(prepare(), /restore its backup/);
  assert.deepEqual(paths, [storage]);
});

test('Status reads coalesce, expire and recover after a failed read', async () => {
  const sample = hardwareFixture();
  let now = 1000;
  let unavailable = false;
  const reader = new HomeKitStatusReader(async () => {
    if (unavailable) throw new Error('offline');
    return sample.hardware.read();
  }, () => now);
  await Promise.all([reader.read(), reader.read()]);
  assert.equal(sample.reads, 1);
  now += 4999;
  await reader.read();
  assert.equal(sample.reads, 1);
  now += 1;
  unavailable = true;
  await Promise.all([reader.read(), reader.read()].map(read => assert.rejects(read, hapError(HAPStatus.SERVICE_COMMUNICATION_FAILURE))));
  unavailable = false;
  await reader.read();
  assert.equal(sample.reads, 2);
  reader.dispose();
  await assert.rejects(reader.read(), hapError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
});

test('Writes discard older reads and invalidate cached status even when a command partially fails', async () => {
  const sample = hardwareFixture();
  const oldRead = deferred<DeviceStatus>();
  let reads = 0;
  const reader = new HomeKitStatusReader(() => ++reads === 1 ? oldRead.promise : sample.hardware.read());
  const pendingRead = assert.rejects(reader.read(), hapError(HAPStatus.RESOURCE_BUSY));
  await nextTurn();
  const command = deferred<void>();
  const writing = reader.write(() => command.promise);
  await assert.rejects(reader.read(), hapError(HAPStatus.RESOURCE_BUSY));
  sample.status.left.targetTemperatureF = 75;
  command.resolve();
  await writing;
  assert.equal((await reader.read()).left.targetTemperatureF, 75);
  oldRead.resolve({ ...sample.status, left: { ...sample.status.left, targetTemperatureF: 86 } });
  await pendingRead;
  assert.equal((await reader.read()).left.targetTemperatureF, 75);
  await assert.rejects(reader.write(async () => {
    sample.status.left.targetTemperatureF = 80;
    throw new Error('partial dispatch');
  }), hapError(HAPStatus.SERVICE_COMMUNICATION_FAILURE));
  assert.equal((await reader.read()).left.targetTemperatureF, 80);
});

test('Real HAP thermostats keep accessory identities, convert units and target the selected side', async () => {
  const sample = hardwareFixture();
  const collection = createHomeKitAccessories(identity.id, sample.hardware);
  try {
    const names = ['Free Sleep left', 'Free Sleep right', 'Bed flat', 'Bed sleep', 'Bed relax', 'Bed read', 'Stop bed movement', 'Prime Pod'];
    assert.deepEqual(collection.accessories.map(accessory => accessory.displayName), names);
    assert.deepEqual(collection.accessories.map(accessory => accessory.UUID),
      ['left', 'right', ...names.slice(2)].map(name => uuid.generate(`${identity.id}:${name}`)));
    const left = collection.accessories[0].getService(Service.Thermostat)!;
    const right = collection.accessories[1].getService(Service.Thermostat)!;
    assert.equal(await left.getCharacteristic(Characteristic.CurrentTemperature).handleGetRequest(), 25);
    assert.equal(await left.getCharacteristic(Characteristic.TargetTemperature).handleGetRequest(), 30);
    assert.equal(await left.getCharacteristic(Characteristic.CurrentHeatingCoolingState).handleGetRequest(), 1);
    assert.equal(await right.getCharacteristic(Characteristic.CurrentHeatingCoolingState).handleGetRequest(), 2);
    assert.equal(sample.reads, 1);
    await left.getCharacteristic(Characteristic.TargetTemperature).handleSetRequest(20);
    await right.getCharacteristic(Characteristic.TargetHeatingCoolingState).handleSetRequest(0);
    assert.deepEqual(sample.writes, [{ left: { targetTemperatureF: 68 } }, { right: { isOn: false } }]);
    assert.equal(await right.getCharacteristic(Characteristic.CurrentHeatingCoolingState).handleGetRequest(), 0);
    await left.getCharacteristic(Characteristic.TargetTemperature).handleSetRequest(25);
    assert.equal(await left.getCharacteristic(Characteristic.CurrentHeatingCoolingState).handleGetRequest(), 0);
  } finally { collection.dispose(); }
});

test('Temperature writes clamp the edge half-degrees to Pod limits and reject invalid requests', async () => {
  const sample = hardwareFixture();
  const collection = createHomeKitAccessories(identity.id, sample.hardware);
  try {
    const service = collection.accessories[0].getService(Service.Thermostat)!;
    const target = service.getCharacteristic(Characteristic.TargetTemperature);
    await target.handleSetRequest(12.5);
    await target.handleSetRequest(43.5);
    assert.deepEqual(sample.writes, [{ left: { targetTemperatureF: 55 } }, { left: { targetTemperatureF: 110 } }]);
    for (const value of [NaN, Infinity, 0, 44, '20', true]) {
      await assert.rejects(target.handleSetRequest(value), error => error === HAPStatus.INVALID_VALUE_IN_REQUEST);
    }
    await assert.rejects(service.getCharacteristic(Characteristic.TargetHeatingCoolingState).handleSetRequest(1),
      error => error === HAPStatus.INVALID_VALUE_IN_REQUEST);
    assert.equal(sample.writes.length, 2);
  } finally { collection.dispose(); }
});

test('Refreshing publishes temperature and demand states and reports communication failures', async () => {
  const sample = hardwareFixture();
  let offline = false;
  const read = sample.hardware.read;
  sample.hardware.read = () => offline ? Promise.reject(new Error('offline')) : read();
  const collection = createHomeKitAccessories(identity.id, sample.hardware);
  try {
    const service = collection.accessories[0].getService(Service.Thermostat)!;
    const current = service.getCharacteristic(Characteristic.CurrentTemperature);
    await collection.refresh();
    assert.equal(current.value, 25);
    assert.equal(service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value, 1);
    await service.getCharacteristic(Characteristic.TargetHeatingCoolingState).handleSetRequest(0);
    offline = true;
    await collection.refresh();
    assert.equal(current.statusCode, HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    await assert.rejects(current.handleGetRequest(), error => error === HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    offline = false;
    await collection.refresh();
    assert.equal(current.statusCode, HAPStatus.SUCCESS);
    assert.equal(service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value, 0);
  } finally { collection.dispose(); }
});

test('Momentary actions coalesce duplicate requests while Stop runs independently and switches reset', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const sample = hardwareFixture();
  const moving = deferred<void>();
  sample.hardware.move = async position => { sample.moves.push(position); await moving.promise; };
  const collection = createHomeKitAccessories(identity.id, sample.hardware);
  const action = (name: string) => collection.accessories.find(accessory => accessory.displayName === name)!
    .getService(Service.Switch)!.getCharacteristic(Characteristic.On);
  try {
    const read = action('Bed read');
    await read.handleSetRequest(false);
    assert.equal(sample.moves.length, 0);
    const first = read.handleSetRequest(true);
    const duplicate = read.handleSetRequest(true);
    await nextTurn();
    assert.deepEqual(sample.moves, [BASE_PRESETS.read]);
    await action('Stop bed movement').handleSetRequest(true);
    assert.equal(sample.stops, 1);
    moving.resolve();
    await Promise.all([first, duplicate]);
    assert.equal(read.value, true);
    context.mock.timers.tick(100);
    assert.equal(read.value, false);
    await action('Prime Pod').handleSetRequest(true);
    assert.deepEqual(sample.writes, [{ isPriming: true }]);
    collection.dispose();
    await assert.rejects(read.handleSetRequest(true), error => error === HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  } finally { collection.dispose(); }
});

test('Failed actions return a HomeKit failure and can be retried; disposed pending dispatches never run', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const sample = hardwareFixture();
  let fail = true;
  sample.hardware.move = async () => { if (fail) throw new Error('base unavailable'); };
  const collection = createHomeKitAccessories(identity.id, sample.hardware);
  const action = collection.accessories[2].getService(Service.Switch)!.getCharacteristic(Characteristic.On);
  await assert.rejects(action.handleSetRequest(true), error => error === HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  context.mock.timers.tick(100);
  assert.equal(action.value, false);
  fail = false;
  await action.handleSetRequest(true);
  collection.dispose();
  const second = createHomeKitAccessories(identity.id, sample.hardware);
  const prime = second.accessories.at(-1)!.getService(Service.Switch)!.getCharacteristic(Characteristic.On);
  const pending = assert.rejects(prime.handleSetRequest(true), error => error === HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  second.dispose();
  await pending;
  assert.deepEqual(sample.writes, []);
});

test('Bridge readiness waits for discovery, preserves identity on restart and never destroys pairing data', async context => {
  const sample = controllerFixture();
  context.after(() => sample.controller.stop());
  const starting = sample.controller.start();
  assert.strictEqual(sample.controller.start(), starting);
  await nextTurn();
  assert.equal(sample.bridges.length, 1);
  assert.equal(sample.controller.status().state, 'starting');
  assert.equal(sample.controller.status().pairingCode, null);
  sample.bridges[0].emit('listening', 51826, '127.0.0.1');
  await nextTurn();
  assert.equal(sample.controller.status().running, false);
  sample.bridges[0].emit('advertised');
  await starting;
  assert.equal(sample.controller.status().running, true);
  assert.equal(sample.controller.status().pairingCode, identity.pin);
  assert.equal(sample.bridges[0].publications, 1);
  await sample.controller.stop();
  assert.equal(sample.bridges[0].removals, 1);
  assert.equal(sample.controller.status().pairingCode, null);
  const restarting = sample.controller.start();
  await nextTurn();
  assert.equal(sample.bridges[1].UUID, sample.bridges[0].UUID);
  assert.deepEqual(sample.bridges[1].bridgedAccessories.map(accessory => accessory.UUID),
    sample.bridges[0].bridgedAccessories.map(accessory => accessory.UUID));
  sample.bridges[1].emit('advertised');
  await restarting;
});

test('Discovery timeout and rejected publication clean up and allow a later restart', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const sample = controllerFixture();
  context.after(() => sample.controller.stop());
  const starting = sample.controller.start();
  await nextTurn();
  context.mock.timers.tick(30000);
  await starting;
  assert.equal(sample.controller.status().state, 'error');
  assert.match(sample.controller.status().error!, /discovery did not start/);
  assert.equal(sample.bridges[0].removals, 1);
  assert.equal(sample.bridges[0].listenerCount('advertised'), 0);
  const restarting = sample.controller.start();
  await nextTurn();
  sample.bridges[1].emit('advertised');
  await restarting;
  assert.equal(sample.controller.status().error, null);
  await sample.controller.stop();
  const failed = new HomeKitBridgeController({ enabled: true, port: 51826, prepare: async () => identity,
    hardware: sample.hardware, createBridge: () => {
      const bridge = new UnpublishedBridge('Failed', uuid.generate('failed'));
      bridge.onPublish = async () => { throw new Error('publication refused'); };
      sample.bridges.push(bridge);
      return bridge;
    } });
  await failed.start();
  assert.equal(failed.status().state, 'error');
  assert.match(failed.status().error!, /publication refused/);
  assert.equal(sample.bridges[2].removals, 1);
  assert.equal(sample.bridges[2].listenerCount('advertised'), 0);
});

test('Stop cancels initialization before publication and prevents a late publication from reopening', async () => {
  const preparing = deferred<typeof identity>();
  const early = controllerFixture({ prepare: () => preparing.promise });
  const starting = early.controller.start();
  await nextTurn();
  const stopping = early.controller.stop();
  preparing.resolve(identity);
  await Promise.all([starting, stopping]);
  assert.equal(early.bridges.length, 0);
  assert.equal(early.controller.status().state, 'stopped');

  const publishing = deferred<void>();
  const bridge = new UnpublishedBridge('Late', uuid.generate('late'));
  bridge.onPublish = () => publishing.promise;
  const controller = new HomeKitBridgeController({ enabled: true, port: 51826, prepare: async () => identity,
    hardware: early.hardware, createBridge: () => bridge });
  const laterStart = controller.start();
  await nextTurn();
  const laterStop = controller.stop();
  assert.equal(controller.status().state, 'stopping');
  const target = bridge.bridgedAccessories[0].getService(Service.Thermostat)!.getCharacteristic(Characteristic.TargetTemperature);
  await assert.rejects(target.handleSetRequest(20), error => error === HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  assert.equal(bridge.removals, 0);
  publishing.resolve();
  await Promise.all([laterStart, laterStop]);
  bridge.emit('advertised');
  assert.equal(controller.status().state, 'stopped');
  assert.equal(controller.status().pairingCode, null);
  assert.equal(bridge.removals, 1);
});

test('Discovery failure becomes visible while a slow publication settles for cleanup', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const publishing = deferred<void>();
  const bridge = new UnpublishedBridge('Slow', uuid.generate('slow-publication'));
  bridge.onPublish = () => publishing.promise;
  const sample = hardwareFixture();
  const controller = new HomeKitBridgeController({ enabled: true, port: 51826, prepare: async () => identity,
    hardware: sample.hardware, createBridge: () => bridge });
  const starting = controller.start();
  await nextTurn();
  context.mock.timers.tick(30000);
  await nextTurn();
  assert.equal(controller.status().state, 'error');
  assert.match(controller.status().error!, /discovery did not start/);
  assert.equal(controller.status().pairingCode, null);
  assert.equal(bridge.removals, 0);
  publishing.resolve();
  await starting;
  assert.equal(bridge.removals, 1);
  assert.equal(controller.status().state, 'error');
});

test('Shutdown stops polling, suppresses late readings and serializes a requested restart', async context => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const reading = deferred<DeviceStatus>();
  const sample = hardwareFixture();
  let reads = 0;
  sample.hardware.read = () => { reads += 1; return reading.promise; };
  const bridges: UnpublishedBridge[] = [];
  const controller = new HomeKitBridgeController({ enabled: true, port: 51826, prepare: async () => identity,
    hardware: sample.hardware, createBridge: () => {
      const bridge = new UnpublishedBridge('Polling', uuid.generate(identity.id));
      bridges.push(bridge);
      return bridge;
    } });
  context.after(() => controller.stop());
  const starting = controller.start();
  await nextTurn();
  bridges[0].emit('advertised');
  await starting;
  context.mock.timers.tick(10000);
  await nextTurn();
  context.mock.timers.tick(40000);
  await nextTurn();
  assert.equal(reads, 1);
  const current = bridges[0].bridgedAccessories[0].getService(Service.Thermostat)!.getCharacteristic(Characteristic.CurrentTemperature);
  let changes = 0;
  current.on('change', () => { changes += 1; });
  const stopping = controller.stop();
  const restarting = controller.start();
  reading.resolve(sample.status);
  await stopping;
  await nextTurn();
  assert.equal(changes, 0);
  assert.equal(controller.status().state, 'starting');
  assert.equal(bridges[0].removals, 1);
  bridges[1].emit('advertised');
  await restarting;
  assert.equal(controller.status().running, true);
  await controller.stop();
  context.mock.timers.tick(40000);
  await nextTurn();
  assert.equal(reads, 1);
});

test('Disabled bridge and invalid ports do not touch identity storage or publish', async () => {
  let preparations = 0;
  const prepare = async () => { preparations += 1; return identity; };
  const disabled = controllerFixture({ enabled: false, prepare });
  await disabled.controller.start();
  await disabled.controller.stop();
  assert.equal(disabled.controller.status().state, 'disabled');
  for (const port of [0, -1, 65536, 1.5, NaN]) {
    const invalid = controllerFixture({ prepare, port });
    await invalid.controller.start();
    assert.equal(invalid.controller.status().state, 'error');
    assert.match(invalid.controller.status().error!, /HOMEKIT_PORT/);
    assert.equal(invalid.bridges.length, 0);
  }
  assert.equal(preparations, 0);
});

test('Failed unpublish remains visible and a successful Stop retry clears the error', async () => {
  const sample = controllerFixture();
  const starting = sample.controller.start();
  await nextTurn();
  sample.bridges[0].emit('advertised');
  await starting;
  sample.bridges[0].onUnpublish = async () => { throw new Error('cannot stop'); };
  await sample.controller.stop();
  assert.equal(sample.controller.status().state, 'error');
  assert.match(sample.controller.status().error!, /could not finish stopping/);
  assert.equal(sample.controller.status().running, false);
  sample.bridges[0].onUnpublish = async () => {};
  await sample.controller.stop();
  assert.equal(sample.controller.status().state, 'stopped');
  assert.equal(sample.controller.status().error, null);
  assert.equal(sample.bridges[0].removals, 2);
});
