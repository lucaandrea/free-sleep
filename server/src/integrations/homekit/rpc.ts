import { HapStatusError } from 'hap-nodejs';
import { DeviceStatusSchema, type DeviceStatus } from '../../routes/deviceStatus/deviceStatusSchema.js';
import type { HomeKitHardware } from './accessories.js';
import { HOMEKIT_BUSY, HOMEKIT_FAILURE, REQUEST_TIMEOUT_MS, homeKitCommandSchema,
  type ChildMessage, type ParentMessage } from './ipc.js';

type Response = Extract<ParentMessage, { type: 'response' }>;
type Pending = { timer: ReturnType<typeof setTimeout>; resolve: (value: DeviceStatus | null) => void; reject: (error: Error) => void };

export class HomeKitRpc {
  private sequence = 0;
  private disposed = false;
  private pending = new Map<number, Pending>();
  constructor(private readonly send: (message: ChildMessage) => Promise<void>, private readonly timeoutMs = REQUEST_TIMEOUT_MS) {}

  // Match one reply per request and cancel work that outlives HomeKit's response window.
  request(input: unknown): Promise<DeviceStatus | null> {
    if (this.disposed) return Promise.reject(new HapStatusError(HOMEKIT_FAILURE));
    const command = homeKitCommandSchema.parse(input);
    if (this.pending.size >= (command.action === 'stop' ? 33 : 32)) return Promise.reject(new HapStatusError(HOMEKIT_BUSY));
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

  receive(response: Response) {
    const request = this.pending.get(response.requestId);
    if (!request) return;
    this.pending.delete(response.requestId);
    clearTimeout(request.timer);
    if (response.result.ok) request.resolve(response.result.value);
    else request.reject(new HapStatusError(response.result.code));
  }

  hardware(): HomeKitHardware {
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
