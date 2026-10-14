
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="e6c7fcc4-0b3c-52fb-b86a-e98839733a84")}catch(e){}}();
import { Bridge, Characteristic, Service, uuid } from 'hap-nodejs';
import { createHomeKitAccessories } from './accessories.js';
// publish() starts the TCP listener; only advertised confirms that mDNS discovery is ready.
function waitForDiscovery(bridge, signal, timeoutMs) {
    let finish;
    const promise = new Promise((resolve, reject) => {
        const onAdvertised = () => finish();
        const onAbort = () => finish(new Error('HomeKit startup cancelled'));
        const timer = setTimeout(() => finish(new Error('HomeKit discovery did not start; check local network and mDNS')), timeoutMs);
        timer.unref();
        finish = error => {
            clearTimeout(timer);
            bridge.off('advertised', onAdvertised);
            signal.removeEventListener('abort', onAbort);
            if (error)
                reject(error);
            else
                resolve();
        };
        bridge.once('advertised', onAdvertised);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted)
            onAbort();
    });
    return { promise, cancel: () => finish(new Error('HomeKit startup cancelled')) };
}
export class HomeKitBridgeController {
    options;
    state;
    error = null;
    desiredRunning = false;
    revision = 0;
    operation = Promise.resolve();
    startup;
    session;
    constructor(options) {
        this.options = options;
        this.state = options.enabled ? 'stopped' : 'disabled';
    }
    status() {
        const running = this.state === 'running';
        return {
            enabled: this.options.enabled,
            state: this.state,
            running,
            pairingCode: running ? this.session.identity.pin : null,
            setupURI: running ? this.session.bridge.setupURI() : null,
            error: this.error,
        };
    }
    deactivate(session) {
        if (session.poll)
            clearInterval(session.poll);
        session.poll = undefined;
        session.accessories.dispose();
    }
    async cleanup() {
        const session = this.session;
        if (!session)
            return;
        this.deactivate(session);
        // Finish publication before unpublishing so a late startup cannot reopen the bridge after Stop.
        await session.publishing?.catch(() => undefined);
        await session.bridge.unpublish();
        this.session = undefined;
    }
    // Serialize starts and stops; each request retires callbacks from an earlier desired state.
    start() {
        if (!this.options.enabled || this.desiredRunning)
            return this.operation;
        this.desiredRunning = true;
        const revision = ++this.revision;
        const startup = new AbortController();
        this.startup = startup;
        this.state = 'starting';
        this.error = null;
        this.operation = this.operation.then(async () => {
            if (revision !== this.revision)
                return;
            try {
                if (!Number.isInteger(this.options.port) || this.options.port < 1 || this.options.port > 65535) {
                    throw new Error('HOMEKIT_PORT must be an integer from 1 to 65535');
                }
                await this.cleanup();
                const identity = await this.options.prepare();
                if (startup.signal.aborted)
                    return;
                const bridge = this.options.createBridge?.(identity) ?? new Bridge('Free Sleep', uuid.generate(identity.id));
                const accessories = createHomeKitAccessories(identity.id, this.options.hardware);
                const session = { bridge, identity, accessories, refreshing: false };
                this.session = session;
                bridge.getService(Service.AccessoryInformation)
                    .setCharacteristic(Characteristic.Manufacturer, 'Free Sleep')
                    .setCharacteristic(Characteristic.Model, 'Local Pod bridge')
                    .setCharacteristic(Characteristic.SerialNumber, identity.id);
                bridge.addBridgedAccessories(accessories.accessories);
                const discovery = waitForDiscovery(bridge, startup.signal, this.options.discoveryTimeoutMs ?? 30000);
                try {
                    session.publishing = Promise.resolve().then(() => {
                        startup.signal.throwIfAborted();
                        return bridge.publish({ username: identity.username, pincode: identity.pin,
                            category: 2 /* Categories.BRIDGE */, port: this.options.port });
                    });
                    await Promise.all([session.publishing, discovery.promise]);
                }
                finally {
                    discovery.cancel();
                }
                if (startup.signal.aborted)
                    return;
                this.state = 'running';
                session.poll = setInterval(() => {
                    if (session.refreshing)
                        return;
                    session.refreshing = true;
                    void accessories.refresh().finally(() => { session.refreshing = false; });
                }, this.options.pollIntervalMs ?? 10000);
                session.poll.unref();
            }
            catch (error) {
                let message = error instanceof Error ? error.message : 'HomeKit unavailable';
                // Surface failure even if HAP publication is still settling before it can be cleaned up.
                if (revision === this.revision) {
                    this.desiredRunning = false;
                    this.state = 'error';
                    this.error = message;
                }
                try {
                    await this.cleanup();
                }
                catch {
                    message += '; HomeKit could not finish stopping. Restart the server before retrying';
                }
                if (revision === this.revision) {
                    this.error = message;
                }
            }
        });
        return this.operation;
    }
    stop() {
        if (!this.options.enabled)
            return this.operation;
        this.desiredRunning = false;
        const revision = ++this.revision;
        this.state = 'stopping';
        this.startup?.abort();
        if (this.session)
            this.deactivate(this.session);
        this.operation = this.operation.then(async () => {
            try {
                await this.cleanup();
                if (revision === this.revision) {
                    this.state = 'stopped';
                    this.error = null;
                }
            }
            catch {
                if (revision === this.revision) {
                    this.state = 'error';
                    this.error = 'HomeKit could not finish stopping. Restart the server before retrying';
                }
            }
        });
        return this.operation;
    }
}
//# sourceMappingURL=controller.js.map
//# debugId=e6c7fcc4-0b3c-52fb-b86a-e98839733a84
