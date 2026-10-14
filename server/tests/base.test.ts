import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BaseController } from '../src/base/controller.js';
import { BaseDecoder, checksumPacket, movePacket, stopPacket } from '../src/base/protocol.js';
import type { BaseTransport } from '../src/base/types.js';
import { createDispatchGuard } from '../src/control/dispatchGuard.js';

const telemetry = (headTicks = 763, feetTicks = 190) => {
  const payload = Buffer.alloc(18);
  payload.fill(255, 0, 4); payload[6] = 34;
  for (const offset of [9, 13]) payload.writeUInt16LE(feetTicks, offset);
  for (const offset of [11, 15]) payload.writeUInt16LE(headTicks, offset);
  return checksumPacket(payload);
};
class TestTransport implements BaseTransport {
  packets: string[] = [];
  notify: (bytes: Uint8Array) => void = () => {};
  fail: (error: Error) => void = () => {};
  async connect(_configuration: unknown, notify: (bytes: Uint8Array) => void, fail: (error: Error) => void) {
    this.notify = notify; this.fail = fail;
  }
  async write(bytes: Uint8Array) { this.packets.push(Buffer.from(bytes).toString('hex')); }
  close() {}
}
const createController = async () => {
  const transport = new TestTransport();
  let now = 100000;
  const controller = new BaseController(transport, async () => ({ Address: 'AA:BB:CC:DD:EE:FF', SplitBase: false }), () => now);
  await controller.connect();
  return { transport, controller, advance: () => { now += 16000; } };
};

test('upstream packets, nonlinear calibration and strict limits', () => {
  assert.equal(stopPacket().toString('hex'), 'ffffffff0500000000d700d804');
  assert.equal(movePacket('head', 30, 50).toString('hex'), 'ffffffff010021143206fb020000000000006705');
  assert.equal(movePacket('feet', 15, 50).readUInt16LE(10), 540);
  for (const angle of [-1, 0.1, 61, NaN]) assert.throws(() => movePacket('head', angle, 50));
  assert.throws(() => movePacket('feet', 46, 50));
  assert.throws(() => movePacket('head', 30, 29));
});
test('fragmented and corrupt telemetry recovers without inventing flat positions', () => {
  const decoder = new BaseDecoder();
  const packet = telemetry();
  assert.deepEqual(decoder.push(packet.subarray(0, 7)), []);
  assert.equal(decoder.push(packet.subarray(7))[0].left.head, 30);
  const broken = Buffer.from(packet); broken[18] = 0;
  assert.equal(decoder.push(Buffer.concat([Buffer.alloc(10000, 1), broken, packet])).length, 1);
  assert.deepEqual(decoder.push(telemetry(3000)), []);
});
test('movement requires current telemetry, but stale telemetry does not block stop', async () => {
  const { controller, transport, advance } = await createController();
  await assert.rejects(controller.move({ head: 1, feet: 5 }), /current base position/);
  transport.notify(telemetry()); advance();
  await assert.rejects(controller.move({ head: 1, feet: 5 }), /current base position/);
  await controller.stop();
  assert.equal(transport.packets.length, 1);
});
test('stop cancels pending feet motion and retains notification delivery', async () => {
  const { controller, transport } = await createController();
  transport.notify(telemetry());
  const moving = controller.move({ head: 1, feet: 5 });
  const rejected = assert.rejects(moving, /cancelled/);
  await new Promise(resolve => setTimeout(resolve, 20));
  await controller.stop();
  await rejected;
  assert.equal(transport.packets.length, 2);
  assert.equal(transport.packets[1], stopPacket().toString('hex'));
  transport.notify(telemetry(24));
  assert.equal(controller.status().position?.left.head, 1);
});
test('disconnect rejects further commands and unknown configuration stays unknown', async () => {
  const { controller, transport } = await createController();
  transport.notify(telemetry()); transport.fail(new Error('Disconnected'));
  assert.equal(controller.status().position, null);
  await assert.rejects(controller.stop(), /disconnected/);
  assert.equal(transport.packets.length, 0);
  const missing = new BaseController(new TestTransport(), async () => { throw new Error('No configuration'); });
  await assert.rejects(missing.connect(), /No configuration/);
  assert.equal(missing.status().position, null);
});

test('publisher cancellation prevents delayed feet writes and cancelled Stop does not reach the transport', async () => {
  const { controller, transport } = await createController();
  transport.notify(telemetry());
  const cancellation = new AbortController();
  const guard = createDispatchGuard(cancellation.signal, Date.now() + 8000);
  const movement = controller.move({ head: 1, feet: 5 }, guard);
  const rejected = assert.rejects(movement, /cancelled/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(transport.packets.length, 1);
  cancellation.abort();
  await rejected;
  await assert.rejects(controller.stop(guard), /cancelled/);
  assert.equal(transport.packets.length, 1);
  await controller.stop();
  assert.equal(transport.packets[1], stopPacket().toString('hex'));
});

test('expired movement requests do not issue even the first base packet', async () => {
  const { controller, transport } = await createController();
  transport.notify(telemetry());
  const guard = createDispatchGuard(new AbortController().signal, Date.now() - 1);
  await assert.rejects(controller.move({ head: 1, feet: 5 }, guard), /expired/);
  assert.equal(transport.packets.length, 0);
});
