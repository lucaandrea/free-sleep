import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Socket } from 'node:net';
import type { MessageStream } from '../src/8sleep/messageStream.js';
import { SequentialQueue } from '../src/8sleep/sequentialQueue.js';
import { createDispatchGuard } from '../src/control/dispatchGuard.js';

test('Cancellation is rechecked inside the real Franken queue and queued manual coordination', async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'free-sleep-dispatch-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'lowdb'));
  process.env.DATA_FOLDER = `${directory}/`; process.env.ENV = 'local';
  // No connection is started: this constructs Franken with an in-memory socket and response stream.
  const { Franken } = await import('../src/8sleep/frankenServer.js');
  const packets: string[] = [];
  const socket = { write: (bytes: Buffer, callback: () => void) => { packets.push(bytes.toString()); callback(); } } as unknown as Socket;
  const stream = { readMessage: async () => Buffer.from('ok') } as unknown as MessageStream;
  const queue = new SequentialQueue();
  const franken = new Franken(socket, stream, queue);
  let release!: () => void;
  const blocker = queue.exec(() => new Promise<void>(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  const cancellation = new AbortController();
  const guard = createDispatchGuard(cancellation.signal, Date.now() + 8000);
  const waiting = assert.rejects(franken.callFunction('TEMP_LEVEL_LEFT', '20', undefined, guard), /cancelled/);
  cancellation.abort(); release(); await blocker; await waiting;
  assert.deepEqual(packets, []);
  await franken.callFunction('TEMP_LEVEL_LEFT', '10');
  assert.deepEqual(packets, ['11\n10\n\n']);

  const { registerComfortController } = await import('../src/thermal/coordinator.js');
  const { updateDeviceStatus } = await import('../src/routes/deviceStatus/updateDeviceStatus.js');
  let apply!: () => Promise<void>;
  let releaseResult!: () => void;
  registerComfortController((command, source, handler) => {
    assert.equal(source, 'manual');
    apply = () => handler(command);
    return new Promise(resolve => { releaseResult = resolve; });
  });
  const manual = new AbortController();
  const request = updateDeviceStatus({ isPriming: true }, 'manual', createDispatchGuard(manual.signal, Date.now() + 8000));
  manual.abort();
  await assert.rejects(apply(), /cancelled/);
  releaseResult(); await request;
  assert.deepEqual(packets, ['11\n10\n\n']);
});
