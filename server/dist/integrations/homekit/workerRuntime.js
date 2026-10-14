
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="9317cdc4-d8eb-533c-a700-5cc02fe3e8f6")}catch(e){}}();
import { HAPStorage } from 'hap-nodejs';
import { HomeKitBridgeController } from './controller.js';
import { createHomeKitPreparation } from './identity.js';
import { parentMessageSchema } from './ipc.js';
import { HomeKitRpc } from './rpc.js';
// The child owns HAP sockets and pairing storage only. All Pod commands go to the parent's existing controllers.
export function runHomeKitWorker(createController = (options) => new HomeKitBridgeController(options)) {
    let controller;
    let stopping = false;
    const send = (message) => new Promise((resolve, reject) => {
        if (!process.connected || !process.send)
            return reject(new Error('HomeKit parent disconnected'));
        process.send(message, error => error ? reject(error) : resolve());
    });
    const rpc = new HomeKitRpc(send);
    const report = (message) => { void send(message).catch(() => undefined); };
    async function stop() {
        if (stopping)
            return;
        stopping = true;
        rpc.dispose();
        const deadline = setTimeout(() => process.exit(1), 2500);
        try {
            await controller?.stop();
        }
        finally {
            clearTimeout(deadline);
            process.exit(0);
        }
    }
    process.on('message', (input) => {
        const parsed = parentMessageSchema.safeParse(input);
        if (!parsed.success) {
            void stop();
            return;
        }
        const message = parsed.data;
        if (message.type === 'stop') {
            void stop();
            return;
        }
        if (stopping)
            return;
        if (message.type === 'response') {
            rpc.receive(message);
            return;
        }
        if (controller) {
            void stop();
            return;
        }
        controller = createController({ enabled: true, port: message.configuration.port, bind: message.configuration.bind,
            prepare: createHomeKitPreparation(message.configuration.storage, storage => HAPStorage.setCustomStoragePath(storage)),
            hardware: rpc.hardware(), onStatus: status => report({ type: 'status', status }) });
        void controller.start();
    });
    process.on('disconnect', () => { void stop(); });
    process.on('SIGTERM', () => { void stop(); });
    process.on('SIGINT', () => { void stop(); });
    // Observe a fatal error without suppressing Node's normal process termination.
    process.on('uncaughtExceptionMonitor', (error) => {
        const code = error.code;
        report({ type: 'fatal', code: code === 'EADDRINUSE' || code === 'EACCES' || code === 'EAFNOSUPPORT' ? code : 'UNKNOWN' });
    });
    report({ type: 'ready' });
}
//# sourceMappingURL=workerRuntime.js.map
//# debugId=9317cdc4-d8eb-533c-a700-5cc02fe3e8f6
