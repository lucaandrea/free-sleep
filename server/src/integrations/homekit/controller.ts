import { Bridge, Categories, Characteristic, Service, uuid } from 'hap-nodejs';
import { createHomeKitAccessories, type HomeKitHardware } from './accessories.js';
import type { HomeKitIdentity } from './identity.js';
import type { HomeKitBridgeStatus } from './ipc.js';

type BridgeState = 'disabled' | 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
export interface BridgeOptions {
  enabled: boolean;
  port: number;
  bind?: string;
  onStatus?: (status: HomeKitBridgeStatus) => void;
  prepare: () => Promise<HomeKitIdentity>;
  hardware: HomeKitHardware;
  createBridge?: (identity: HomeKitIdentity) => Bridge;
  discoveryTimeoutMs?: number;
  pollIntervalMs?: number;
}
interface BridgeSession {
  bridge: Bridge;
  identity: HomeKitIdentity;
  accessories: ReturnType<typeof createHomeKitAccessories>;
  publishing?: Promise<void>;
  poll?: ReturnType<typeof setInterval>;
  refreshing: boolean;
}

// publish() starts the TCP listener; only advertised confirms that mDNS discovery is ready.
function waitForDiscovery(bridge: Bridge, signal: AbortSignal, timeoutMs: number) {
  let finish: (error?: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    const onAdvertised = () => finish();
    const onAbort = () => finish(new Error('HomeKit startup cancelled'));
    const timer = setTimeout(() => finish(new Error('HomeKit discovery did not start; check local network and mDNS')), timeoutMs);
    timer.unref();
    finish = error => {
      clearTimeout(timer);
      bridge.off('advertised', onAdvertised);
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    bridge.once('advertised', onAdvertised);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  return { promise, cancel: () => finish(new Error('HomeKit startup cancelled')) };
}

export class HomeKitBridgeController {
  private state: BridgeState;
  private error: string | null = null;
  private desiredRunning = false;
  private revision = 0;
  private operation = Promise.resolve();
  private startup?: AbortController;
  private session?: BridgeSession;

  constructor(private readonly options: BridgeOptions) {
    this.state = options.enabled ? 'stopped' : 'disabled';
  }

  status(): HomeKitBridgeStatus {
    const running = this.state === 'running';
    return {
      enabled: this.options.enabled,
      state: this.state,
      running,
      pairingCode: running ? this.session!.identity.pin : null,
      setupURI: running ? this.session!.bridge.setupURI() : null,
      error: this.error,
    };
  }

  private notify() { this.options.onStatus?.(this.status()); }

  private deactivate(session: BridgeSession) {
    if (session.poll) clearInterval(session.poll);
    session.poll = undefined;
    session.accessories.dispose();
  }

  private async cleanup() {
    const session = this.session;
    if (!session) return;
    this.deactivate(session);
    // Finish publication before unpublishing so a late startup cannot reopen the bridge after Stop.
    await session.publishing?.catch(() => undefined);
    await session.bridge.unpublish();
    this.session = undefined;
  }

  // Serialize starts and stops; each request retires callbacks from an earlier desired state.
  start(): Promise<void> {
    if (!this.options.enabled || this.desiredRunning) return this.operation;
    this.desiredRunning = true;
    const revision = ++this.revision;
    const startup = new AbortController();
    this.startup = startup;
    this.state = 'starting';
    this.error = null;
    this.notify();
    this.operation = this.operation.then(async () => {
      if (revision !== this.revision) return;
      try {
        if (!Number.isInteger(this.options.port) || this.options.port < 1 || this.options.port > 65535) {
          throw new Error('HOMEKIT_PORT must be an integer from 1 to 65535');
        }
        await this.cleanup();
        const identity = await this.options.prepare();
        if (startup.signal.aborted) return;
        const bridge = this.options.createBridge?.(identity) ?? new Bridge('Free Sleep', uuid.generate(identity.id));
        const accessories = createHomeKitAccessories(identity.id, this.options.hardware);
        const session: BridgeSession = { bridge, identity, accessories, refreshing: false };
        this.session = session;
        bridge.getService(Service.AccessoryInformation)!
          .setCharacteristic(Characteristic.Manufacturer, 'Free Sleep')
          .setCharacteristic(Characteristic.Model, 'Local Pod bridge')
          .setCharacteristic(Characteristic.SerialNumber, identity.id);
        bridge.addBridgedAccessories(accessories.accessories);
        const discovery = waitForDiscovery(bridge, startup.signal, this.options.discoveryTimeoutMs ?? 30000);
        try {
          session.publishing = Promise.resolve().then(() => {
            startup.signal.throwIfAborted();
            return bridge.publish({ username: identity.username, pincode: identity.pin,
              category: Categories.BRIDGE, port: this.options.port, bind: this.options.bind });
          });
          await Promise.all([session.publishing, discovery.promise]);
        } finally {
          discovery.cancel();
        }
        if (startup.signal.aborted) return;
        this.state = 'running';
        this.notify();
        session.poll = setInterval(() => {
          if (session.refreshing) return;
          session.refreshing = true;
          void accessories.refresh().finally(() => { session.refreshing = false; });
        }, this.options.pollIntervalMs ?? 10000);
        session.poll.unref();
      } catch (error) {
        let message = error instanceof Error ? error.message : 'HomeKit unavailable';
        // Surface failure even if HAP publication is still settling before it can be cleaned up.
        if (revision === this.revision) {
          this.desiredRunning = false;
          this.state = 'error';
          this.error = message;
          this.notify();
        }
        try {
          await this.cleanup();
        } catch {
          message += '; HomeKit could not finish stopping. Restart the server before retrying';
        }
        if (revision === this.revision) {
          this.error = message;
          this.notify();
        }
      }
    });
    return this.operation;
  }

  stop(): Promise<void> {
    if (!this.options.enabled) return this.operation;
    this.desiredRunning = false;
    const revision = ++this.revision;
    this.state = 'stopping';
    this.notify();
    this.startup?.abort();
    if (this.session) this.deactivate(this.session);
    this.operation = this.operation.then(async () => {
      try {
        await this.cleanup();
        if (revision === this.revision) {
          this.state = 'stopped';
          this.error = null;
          this.notify();
        }
      } catch {
        if (revision === this.revision) {
          this.state = 'error';
          this.error = 'HomeKit could not finish stopping. Restart the server before retrying';
          this.notify();
        }
      }
    });
    return this.operation;
  }
}
