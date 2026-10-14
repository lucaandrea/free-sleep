
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="036b338e-045e-5df6-bbd1-113884cbd4d6")}catch(e){}}();
import { HapStatusError } from 'hap-nodejs';
import { DeviceStatusSchema } from '../../routes/deviceStatus/deviceStatusSchema.js';
import { HOMEKIT_BUSY, HOMEKIT_FAILURE, REQUEST_TIMEOUT_MS, homeKitCommandSchema } from './ipc.js';
export class HomeKitRpc {
    send;
    timeoutMs;
    sequence = 0;
    disposed = false;
    pending = new Map();
    constructor(send, timeoutMs = REQUEST_TIMEOUT_MS) {
        this.send = send;
        this.timeoutMs = timeoutMs;
    }
    // Match one reply per request and cancel work that outlives HomeKit's response window.
    request(input) {
        if (this.disposed)
            return Promise.reject(new HapStatusError(HOMEKIT_FAILURE));
        const command = homeKitCommandSchema.parse(input);
        if (this.pending.size >= (command.action === 'stop' ? 33 : 32))
            return Promise.reject(new HapStatusError(HOMEKIT_BUSY));
        const requestId = ++this.sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new HapStatusError(HOMEKIT_FAILURE));
                void this.send({ type: 'cancel', requestId }).catch(() => undefined);
            }, this.timeoutMs);
            timer.unref();
            this.pending.set(requestId, { timer, resolve, reject });
            void this.send({ type: 'request', requestId, deadline: Date.now() + this.timeoutMs, command }).catch(() => {
                this.receive({ type: 'response', requestId, result: { ok: false, code: HOMEKIT_FAILURE } });
            });
        });
    }
    receive(response) {
        const request = this.pending.get(response.requestId);
        if (!request)
            return;
        this.pending.delete(response.requestId);
        clearTimeout(request.timer);
        if (response.result.ok)
            request.resolve(response.result.value);
        else
            request.reject(new HapStatusError(response.result.code));
    }
    hardware() {
        return {
            read: async () => DeviceStatusSchema.parse(await this.request({ action: 'read' })),
            update: update => this.request({ action: 'update', update }),
            move: position => this.request({ action: 'move', position }),
            stop: () => this.request({ action: 'stop' }),
        };
    }
    dispose() {
        this.disposed = true;
        for (const [requestId] of this.pending) {
            this.receive({ type: 'response', requestId, result: { ok: false, code: HOMEKIT_FAILURE } });
        }
    }
}
//# sourceMappingURL=rpc.js.map
//# debugId=036b338e-045e-5df6-bbd1-113884cbd4d6
