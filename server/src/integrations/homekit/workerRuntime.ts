import { HAPStorage } from 'hap-nodejs';
import { HomeKitBridgeController, type BridgeOptions } from './controller.js';
import { createHomeKitPreparation } from './identity.js';
import { parentMessageSchema, type ChildMessage } from './ipc.js';
import { HomeKitRpc } from './rpc.js';

// The child owns HAP sockets and pairing storage only. All Pod commands go to the parent's existing controllers.
export function runHomeKitWorker(createController = (options: BridgeOptions) => new HomeKitBridgeController(options)) {
  let controller: HomeKitBridgeController | undefined;
  let stopping = false;
  const send = (message: ChildMessage) => new Promise<void>((resolve, reject) => {
    if (!process.connected || !process.send) return reject(new Error('HomeKit parent disconnected'));
    process.send(message, error => error ? reject(error) : resolve());
  });
  const rpc = new HomeKitRpc(send);
  const report = (message: ChildMessage) => { void send(message).catch(() => undefined); };

  async function stop() {
    if (stopping) return;
    stopping = true;
    rpc.dispose();
    const deadline = setTimeout(() => process.exit(1), 2500);
    try { await controller?.stop(); }
    finally {
      clearTimeout(deadline);
      process.exit(0);
    }
  }

  process.on('message', (input: unknown) => {
    const parsed = parentMessageSchema.safeParse(input);
    if (!parsed.success) { void stop(); return; }
    const message = parsed.data;
    if (message.type === 'stop') { void stop(); return; }
    if (stopping) return;
    if (message.type === 'response') { rpc.receive(message); return; }
    if (controller) { void stop(); return; }
    controller = createController({ enabled: true, port: message.configuration.port, bind: message.configuration.bind,
      prepare: createHomeKitPreparation(message.configuration.storage, storage => HAPStorage.setCustomStoragePath(storage)),
      hardware: rpc.hardware(), onStatus: status => report({ type: 'status', status }) });
    void controller.start();
  });
  process.on('disconnect', () => { void stop(); });
  process.on('SIGTERM', () => { void stop(); });
  process.on('SIGINT', () => { void stop(); });
  // Observe a fatal error without suppressing Node's normal process termination.
  process.on('uncaughtExceptionMonitor', (error: NodeJS.ErrnoException) => {
    const code = error.code;
    report({ type: 'fatal', code: code === 'EADDRINUSE' || code === 'EACCES' || code === 'EAFNOSUPPORT' ? code : 'UNKNOWN' });
  });
  report({ type: 'ready' });
}
