import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { fork, type ChildProcess } from 'node:child_process';
import { createServer as createSocketServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setImmediate as nextTurn, setTimeout as delay } from 'node:timers/promises';
import { HomeKitSupervisor } from '../src/integrations/homekit/supervisor.js';
import { HomeKitRpc } from '../src/integrations/homekit/rpc.js';
import { HOMEKIT_BUSY, HOMEKIT_FAILURE, homeKitCommandSchema, type ChildMessage } from '../src/integrations/homekit/ipc.js';
import { deviceStatusFixture } from './fixtures/deviceStatus.js';
import type { DispatchGuard } from '../src/control/dispatchGuard.js';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>(done => { resolve = done; });
  return { promise, resolve };
}

function childHarness(context: TestContext, entry: URL, args: string[] = []) {
  const children: { child: ChildProcess; exited: Promise<void>; report: () => Promise<any>; stderr: () => string }[] = [];
  const spawn = () => {
    const child = fork(entry, args, { env: {}, execArgv: entry.pathname.endsWith('.ts') ? ['--import', import.meta.resolve('tsx')] : [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const exited = new Promise<void>(resolve => { child.once('exit', () => resolve()); child.once('close', () => resolve()); });
    let stderr = '';
    child.stderr!.on('data', data => { stderr += String(data); });
    const reports: unknown[] = [];
    const waiting: ((value: unknown) => void)[] = [];
    createInterface({ input: child.stdout! }).on('line', line => {
      const value: unknown = JSON.parse(line);
      const resolve = waiting.shift();
      if (resolve) resolve(value); else reports.push(value);
    });
    children.push({ child, exited, stderr: () => stderr,
      report: () => reports.length ? Promise.resolve(reports.shift()) : new Promise(resolve => waiting.push(resolve)) });
    context.after(async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited;
    });
    return child;
  };
  return { spawn, children };
}

async function storageFixture(context: TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), 'free-sleep-homekit-process-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const fakeEntry = new URL('./fixtures/homekit-child.mjs', import.meta.url);
const hapEntry = new URL('./fixtures/homekit-hap-child.ts', import.meta.url);
const workerEntry = new URL('../src/integrations/homekit/worker.ts', import.meta.url);

test('Real HAP characteristic handlers cross the child boundary and Stop remains independent', { timeout: 10000 }, async context => {
  const storage = await storageFixture(context);
  const harness = childHarness(context, hapEntry);
  const commands: unknown[] = [];
  const moving = deferred<void>();
  const supervisor = new HomeKitSupervisor({ enabled: true, configuration: { storage, port: 51826 }, spawn: harness.spawn,
    dispatch: async (command, assertCurrent) => {
      assertCurrent(); commands.push(command);
      if (command.action === 'read') return deviceStatusFixture();
      if (command.action === 'move') await moving.promise;
      if (command.action === 'stop') moving.resolve();
      assertCurrent(); return null;
    } });
  context.after(() => supervisor.stop());
  await supervisor.start();
  assert.equal(supervisor.status().running, true);
  assert.deepEqual(await harness.children[0].report(), { current: 25, target: 30, complete: true });
  assert.deepEqual(commands, [
    { action: 'read' }, { action: 'update', update: { left: { targetTemperatureF: 68 } } },
    { action: 'move', position: { head: 40, feet: 0, speed: 50 } }, { action: 'stop' }, { action: 'update', update: { isPriming: true } },
  ]);
  const identity = await readFile(path.join(storage, 'identity.json'), 'utf8');
  await supervisor.stop();
  assert.equal(harness.children[0].child.exitCode, 0);
  assert.equal(supervisor.status().pairingCode, null);
  await supervisor.start();
  await harness.children[1].report();
  assert.equal(await readFile(path.join(storage, 'identity.json'), 'utf8'), identity);
  assert.equal(harness.children.length, 2);
});

test('An occupied listener port crashes only the actual HAP publisher; parent HTTP remains responsive', { timeout: 15000 }, async context => {
  const storage = await storageFixture(context);
  const occupied = createSocketServer(socket => socket.destroy());
  // HAP's bind option restricts mDNS, but the installed library uses a wildcard TCP listener.
  occupied.listen(0, '0.0.0.0');
  await once(occupied, 'listening');
  context.after(() => new Promise<void>(resolve => occupied.close(() => resolve())));
  const address = occupied.address(); assert.ok(address && typeof address !== 'string');
  const harness = childHarness(context, workerEntry);
  let commands = 0;
  const supervisor = new HomeKitSupervisor({ enabled: true,
    configuration: { storage, port: address.port, bind: '127.0.0.1' }, spawn: harness.spawn,
    dispatch: async () => { commands += 1; return null; } });
  context.after(() => supervisor.stop());
  const api = createHttpServer((_request, response) => response.end(JSON.stringify({ api: 'available', homekit: supervisor.status() })));
  api.listen(0, '127.0.0.1'); await once(api, 'listening');
  context.after(() => new Promise<void>(resolve => api.close(() => resolve())));
  const apiAddress = api.address(); assert.ok(apiAddress && typeof apiAddress !== 'string');
  await supervisor.start();
  if (supervisor.status().running) {
    await supervisor.stop();
    assert.fail('The test port was not exclusively occupied');
  }
  await harness.children[0].exited;
  assert.equal(harness.children[0].child.exitCode, 1);
  assert.match(harness.children[0].stderr(), /EADDRINUSE/);
  assert.equal(supervisor.status().state, 'error');
  assert.equal(supervisor.status().pairingCode, null);
  const response = await fetch(`http://127.0.0.1:${apiAddress.port}`);
  assert.deepEqual(await response.json(), { api: 'available', homekit: supervisor.status() });
  assert.equal(commands, 0);
  assert.equal(harness.children.length, 1);
  // Binding failed before listening; HAP never emitted advertised or accepted an accessory connection.
});

test('Publisher crashes cancel pending dispatch guards and do not replay commands or restart automatically', { timeout: 10000 }, async context => {
  const storage = await storageFixture(context);
  const harness = childHarness(context, fakeEntry, ['crash']);
  const entered = deferred<DispatchGuard>();
  const release = deferred<void>();
  let writes = 0;
  const supervisor = new HomeKitSupervisor({ enabled: true, configuration: { storage, port: 51826 }, spawn: harness.spawn,
    dispatch: async (_command, assertCurrent) => {
      entered.resolve(assertCurrent); await release.promise; assertCurrent(); writes += 1; return null;
    } });
  await supervisor.start();
  harness.children[0].child.send({ type: 'exercise', requests: [{ type: 'request', requestId: 1,
    deadline: Date.now() + 8000, command: { action: 'update', update: { left: { targetTemperatureF: 80 } } } }] });
  const guard = await entered.promise;
  await harness.children[0].exited;
  assert.throws(guard, /cancelled/);
  release.resolve(); await nextTurn();
  assert.equal(writes, 0);
  assert.equal(harness.children.length, 1);
  assert.equal(supervisor.status().state, 'error');
});

test('Malformed publisher messages cannot reach the hardware dispatcher', { timeout: 10000 }, async context => {
  const storage = await storageFixture(context);
  const harness = childHarness(context, fakeEntry);
  let dispatches = 0;
  const supervisor = new HomeKitSupervisor({ enabled: true, configuration: { storage, port: 51826 }, spawn: harness.spawn,
    dispatch: async () => { dispatches += 1; return null; } });
  await supervisor.start();
  harness.children[0].child.send({ type: 'exercise', requests: [{ type: 'request', requestId: 1,
    deadline: Date.now() + 8000, command: { action: 'update', update: { settings: { ledBrightness: 1 } } } }] });
  await harness.children[0].exited;
  assert.equal(dispatches, 0);
  assert.equal(supervisor.status().state, 'error');
  for (const command of [{ action: 'move', position: { head: 90, feet: 0 } },
    { action: 'update', update: { left: { targetTemperatureF: 111 } } },
    { action: 'update', update: { left: { isOn: true }, right: { isOn: true } } }, { action: 'connect' }]) {
    assert.equal(homeKitCommandSchema.safeParse(command).success, false);
  }
});

test('Expired, repeated and excessive requests fail while a reserved Stop request can proceed', { timeout: 10000 }, async context => {
  const storage = await storageFixture(context);
  const harness = childHarness(context, fakeEntry);
  const release = deferred<void>();
  let commands = 0;
  let stops = 0;
  const supervisor = new HomeKitSupervisor({ enabled: true, configuration: { storage, port: 51826 }, spawn: harness.spawn,
    dispatch: async (command, assertCurrent) => {
      commands += 1;
      if (command.action === 'stop') stops += 1;
      else await release.promise;
      assertCurrent(); return null;
    } });
  context.after(() => supervisor.stop());
  await supervisor.start();
  const handle = harness.children[0];
  const request = (requestId: number, deadline = Date.now() + 8000, action = 'update') => ({ type: 'request', requestId, deadline,
    command: action === 'stop' ? { action } : { action, update: { left: { isOn: true } } } });
  handle.child.send({ type: 'exercise', requests: [request(1, Date.now() - 1)] });
  assert.equal((await handle.report()).result.code, HOMEKIT_FAILURE);
  handle.child.send({ type: 'exercise', requests: [request(1)] });
  assert.equal((await handle.report()).result.code, HOMEKIT_FAILURE);
  handle.child.send({ type: 'exercise', requests: [...Array.from({ length: 32 }, (_, index) => request(index + 2)),
    request(2), request(34), request(35, Date.now() + 8000, 'stop')] });
  assert.equal((await handle.report()).result.code, HOMEKIT_FAILURE);
  assert.equal((await handle.report()).result.code, HOMEKIT_BUSY);
  assert.equal((await handle.report()).result.ok, true);
  assert.equal(stops, 1);
  assert.equal(commands, 33);
  await supervisor.stop(); release.resolve(); await nextTurn();
});

test('Timeout cancellation retires a delayed command and late responses cannot fulfill another RPC', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const sent: ChildMessage[] = [];
  const rpc = new HomeKitRpc(async message => { sent.push(message); }, 100);
  const first = assert.rejects(rpc.request({ action: 'stop' }), (error: any) => error.hapStatus === HOMEKIT_FAILURE);
  context.mock.timers.tick(100); await first;
  assert.deepEqual(sent[1], { type: 'cancel', requestId: 1 });
  const second = rpc.request({ action: 'stop' });
  rpc.receive({ type: 'response', requestId: 1, result: { ok: true, value: null } });
  rpc.receive({ type: 'response', requestId: 2, result: { ok: true, value: null } });
  assert.equal(await second, null);
  rpc.dispose();
  await assert.rejects(rpc.request({ action: 'read' }));
});

test('Publisher cancellation and request deadlines invalidate commands already waiting in the parent', { timeout: 10000 }, async context => {
  const storage = await storageFixture(context);
  const harness = childHarness(context, fakeEntry);
  const release = deferred<void>();
  const guards: DispatchGuard[] = [];
  const supervisor = new HomeKitSupervisor({ enabled: true, configuration: { storage, port: 51826 }, spawn: harness.spawn,
    dispatch: async (command, assertCurrent) => {
      if (command.action === 'stop') return null;
      guards.push(assertCurrent); await release.promise; assertCurrent(); return null;
    } });
  context.after(() => supervisor.stop());
  await supervisor.start();
  const handle = harness.children[0];
  handle.child.send({ type: 'exercise', requests: [
    { type: 'request', requestId: 1, deadline: Date.now() + 8000, command: { action: 'update', update: { left: { isOn: true } } } },
    { type: 'cancel', requestId: 1 },
    { type: 'request', requestId: 2, deadline: Date.now() + 100, command: { action: 'update', update: { right: { isOn: true } } } },
    { type: 'request', requestId: 3, deadline: Date.now() + 8000, command: { action: 'stop' } },
  ] });
  assert.equal((await handle.report()).result.ok, true);
  assert.equal(guards.length, 2);
  assert.throws(guards[0], /cancelled/);
  await delay(120);
  assert.throws(guards[1], /expired|cancelled/);
  release.resolve();
  assert.equal((await handle.report()).result.code, HOMEKIT_FAILURE);
  assert.equal((await handle.report()).result.code, HOMEKIT_FAILURE);
});

test('The child RPC reserves capacity for Stop and rejects a broken IPC send', async () => {
  const sent: ChildMessage[] = [];
  const rpc = new HomeKitRpc(async message => { sent.push(message); });
  const waiting = Array.from({ length: 32 }, () => rpc.request({ action: 'read' }).catch(error => error));
  const stopped = rpc.request({ action: 'stop' });
  await assert.rejects(rpc.request({ action: 'read' }), (error: any) => error.hapStatus === HOMEKIT_BUSY);
  assert.equal(sent.length, 33);
  rpc.receive({ type: 'response', requestId: 33, result: { ok: true, value: null } });
  await stopped;
  rpc.dispose(); await Promise.all(waiting);
  const broken = new HomeKitRpc(async () => { throw new Error('IPC closed'); });
  await assert.rejects(broken.request({ action: 'stop' }), (error: any) => error.hapStatus === HOMEKIT_FAILURE);
  broken.dispose();
});

test('The default launcher runs the actual worker and preserves a corrupt identity without publishing', { timeout: 10000 }, async context => {
  const storage = await storageFixture(context);
  await writeFile(path.join(storage, 'identity.json'), 'corrupt test identity');
  const supervisor = new HomeKitSupervisor({ enabled: true, configuration: { storage, port: 51826 },
    dispatch: async () => { assert.fail('No hardware request is permitted before startup'); } });
  context.after(() => supervisor.stop());
  await supervisor.start();
  assert.equal(supervisor.status().state, 'error');
  assert.match(supervisor.status().error!, /restore its backup/);
  assert.equal(await readFile(path.join(storage, 'identity.json'), 'utf8'), 'corrupt test identity');
  await supervisor.stop();
  assert.equal(supervisor.status().state, 'stopped');
});

test('Shutdown and startup deadlines terminate only the owned child and allow a later explicit restart', { timeout: 10000 }, async context => {
  const storage = await storageFixture(context);
  const stubborn = childHarness(context, fakeEntry, ['stubborn']);
  const supervisor = new HomeKitSupervisor({ enabled: true, configuration: { storage, port: 51826 }, spawn: stubborn.spawn,
    dispatch: async () => null, stopTimeoutMs: 300 });
  await supervisor.start();
  const stopping = supervisor.stop();
  const restarting = supervisor.start();
  await stopping; await restarting;
  assert.equal(stubborn.children[0].child.signalCode, 'SIGKILL');
  assert.equal(stubborn.children.length, 2);
  assert.equal(supervisor.status().running, true);
  await supervisor.stop();
  assert.equal(stubborn.children[1].child.signalCode, 'SIGKILL');
  const silent = childHarness(context, fakeEntry, ['silent']);
  const timed = new HomeKitSupervisor({ enabled: true, configuration: { storage, port: 51826 }, spawn: silent.spawn,
    dispatch: async () => null, startupTimeoutMs: 200, stopTimeoutMs: 300 });
  await timed.start();
  assert.equal(timed.status().state, 'error');
  assert.match(timed.status().error!, /timed out/);
  await silent.children[0].exited;
});

test('The actual worker runtime exits when its parent IPC channel disappears', { timeout: 10000 }, async context => {
  const storage = await storageFixture(context);
  const harness = childHarness(context, hapEntry, ['idle']);
  const child = harness.spawn();
  await once(child, 'message');
  const running = new Promise<void>(resolve => child.on('message', (message: any) => {
    if (message.type === 'status' && message.status.running) resolve();
  }));
  child.send({ type: 'start', configuration: { storage, port: 51826 } });
  await running;
  child.disconnect();
  await harness.children[0].exited;
  assert.equal(child.exitCode, 0);
});

test('Disabled and invalid configurations never spawn a publisher or create pairing files', async context => {
  const storage = await storageFixture(context);
  let spawns = 0;
  const spawn = (): ChildProcess => { spawns += 1; throw new Error('must not spawn'); };
  const disabled = new HomeKitSupervisor({ enabled: false, configuration: { storage, port: 51826 }, spawn, dispatch: async () => null });
  await disabled.start(); await disabled.stop();
  assert.equal(disabled.status().state, 'disabled');
  const invalid = new HomeKitSupervisor({ enabled: true, configuration: { storage, port: 0 }, spawn, dispatch: async () => null });
  await invalid.start();
  assert.equal(invalid.status().state, 'error');
  assert.equal(spawns, 0);
  assert.deepEqual(await readdir(storage), []);
});
