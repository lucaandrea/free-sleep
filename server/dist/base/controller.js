
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="96323595-db0c-530e-8d99-ea1a188c8bce")}catch(e){}}();
import { BaseDecoder, movePacket, stopPacket } from './protocol.js';
import { BaseError, baseConfigurationSchema, basePositionSchema } from './types.js';
export class BaseController {
    transport;
    configuration;
    now;
    state = 'unconfigured';
    position = null;
    updatedAt = null;
    error = null;
    busy = false;
    stopping = false;
    revision = 0;
    connectionGeneration = 0;
    splitBase = null;
    writes = Promise.resolve();
    constructor(transport, configuration, now = Date.now) {
        this.transport = transport;
        this.configuration = configuration;
        this.now = now;
    }
    status() {
        return {
            state: this.state,
            position: this.position ? { left: this.position.left, right: this.position.right } : null,
            updatedAt: this.updatedAt,
            stale: this.updatedAt === null || this.now() - this.updatedAt > 15000,
            busy: this.busy || this.stopping,
            splitBase: this.splitBase,
            independentControl: false,
            experimental: true,
            error: this.error,
        };
    }
    async connect() {
        if (this.busy || this.stopping || this.state === 'connecting')
            throw new BaseError('Base is busy', 409);
        this.close();
        const generation = this.connectionGeneration;
        this.state = 'connecting';
        try {
            const configuration = baseConfigurationSchema.parse(await this.configuration());
            if (generation !== this.connectionGeneration)
                throw new BaseError('Connection cancelled', 409);
            this.splitBase = configuration.SplitBase;
            const decoder = new BaseDecoder();
            await this.transport.connect(configuration, (bytes) => {
                if (generation !== this.connectionGeneration)
                    return;
                for (const position of decoder.push(bytes)) {
                    this.position = position;
                    this.updatedAt = this.now();
                }
            }, (error) => {
                if (generation !== this.connectionGeneration)
                    return;
                this.close();
                this.state = 'disconnected';
                this.error = error.message;
            });
            if (generation !== this.connectionGeneration)
                throw new BaseError('Connection interrupted');
            this.state = 'connected';
            this.error = null;
        }
        catch (error) {
            this.transport.close();
            this.state = 'unavailable';
            this.error = error instanceof Error ? error.message : 'Base setup unavailable';
            throw new BaseError(this.error);
        }
        return this.status();
    }
    assertReady() {
        if (this.state !== 'connected' || this.status().stale)
            throw new BaseError('Waiting for a current base position');
    }
    write(packet, revision) {
        const operation = this.writes.then(async () => {
            if (revision !== undefined && revision !== this.revision)
                throw new BaseError('Movement cancelled', 409);
            if (this.state !== 'connected')
                throw new BaseError('Base disconnected');
            await this.transport.write(packet);
        });
        this.writes = operation.catch(() => { });
        return operation;
    }
    // Stop invalidates the delayed feet command and never waits behind an entire movement.
    async move(input) {
        const position = basePositionSchema.parse(input);
        this.assertReady();
        if (this.busy || this.stopping)
            throw new BaseError('Another base command is in progress', 409);
        this.busy = true;
        const revision = this.revision;
        try {
            await this.write(movePacket('head', position.head, position.speed), revision);
            await new Promise((resolve) => setTimeout(resolve, 500));
            this.assertReady();
            await this.write(movePacket('feet', position.feet, position.speed), revision);
        }
        finally {
            this.busy = false;
        }
        return this.status();
    }
    async stop() {
        this.revision++;
        // Keep the notification generation active: stopping cancels writes, not telemetry.
        if (this.stopping)
            throw new BaseError('Stop already in progress', 409);
        this.stopping = true;
        try {
            await this.write(stopPacket());
        }
        finally {
            this.stopping = false;
        }
        return this.status();
    }
    close() {
        this.revision++;
        this.connectionGeneration++;
        this.transport.close();
        this.position = null;
        this.updatedAt = null;
        this.state = 'disconnected';
    }
}
//# sourceMappingURL=controller.js.map
//# debugId=96323595-db0c-530e-8d99-ea1a188c8bce
