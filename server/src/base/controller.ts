import { BaseDecoder, movePacket, stopPacket } from './protocol.js';
import { BaseError, BaseTelemetry, BaseTransport, baseConfigurationSchema, basePositionSchema } from './types.js';
import type { DispatchGuard } from '../control/dispatchGuard.js';

export class BaseController {
  private state = 'unconfigured';
  private position: BaseTelemetry | null = null;
  private updatedAt: number | null = null;
  private error: string | null = null;
  private busy = false;
  private stopping = false;
  private revision = 0;
  private connectionGeneration = 0;
  private splitBase: boolean | null = null;
  private writes: Promise<void> = Promise.resolve();
  constructor(
    private transport: BaseTransport,
    private configuration: () => Promise<unknown>,
    private now = Date.now,
  ) {}

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
    if (this.busy || this.stopping || this.state === 'connecting') throw new BaseError('Base is busy', 409);
    this.close();
    const generation = this.connectionGeneration;
    this.state = 'connecting';
    try {
      const configuration = baseConfigurationSchema.parse(await this.configuration());
      if (generation !== this.connectionGeneration) throw new BaseError('Connection cancelled', 409);
      this.splitBase = configuration.SplitBase;
      const decoder = new BaseDecoder();
      await this.transport.connect(
        configuration,
        (bytes) => {
          if (generation !== this.connectionGeneration) return;
          for (const position of decoder.push(bytes)) {
            this.position = position;
            this.updatedAt = this.now();
          }
        },
        (error) => {
          if (generation !== this.connectionGeneration) return;
          this.close();
          this.state = 'disconnected';
          this.error = error.message;
        },
      );
      if (generation !== this.connectionGeneration) throw new BaseError('Connection interrupted');
      this.state = 'connected';
      this.error = null;
    } catch (error) {
      this.transport.close();
      this.state = 'unavailable';
      this.error = error instanceof Error ? error.message : 'Base setup unavailable';
      throw new BaseError(this.error);
    }
    return this.status();
  }

  private assertReady() {
    if (this.state !== 'connected' || this.status().stale) throw new BaseError('Waiting for a current base position');
  }

  private write(packet: Uint8Array, revision?: number, assertCurrent?: DispatchGuard) {
    const operation = this.writes.then(async () => {
      assertCurrent?.();
      if (revision !== undefined && revision !== this.revision) throw new BaseError('Movement cancelled', 409);
      if (this.state !== 'connected') throw new BaseError('Base disconnected');
      await this.transport.write(packet);
    });
    this.writes = operation.catch(() => {});
    return operation;
  }

  // Stop invalidates the delayed feet command and never waits behind an entire movement.
  async move(input: unknown, assertCurrent?: DispatchGuard) {
    assertCurrent?.();
    const position = basePositionSchema.parse(input);
    this.assertReady();
    if (this.busy || this.stopping) throw new BaseError('Another base command is in progress', 409);
    this.busy = true;
    const revision = this.revision;
    try {
      await this.write(movePacket('head', position.head, position.speed), revision, assertCurrent);
      await new Promise((resolve) => setTimeout(resolve, 500));
      this.assertReady();
      await this.write(movePacket('feet', position.feet, position.speed), revision, assertCurrent);
    } finally {
      this.busy = false;
    }
    return this.status();
  }

  async stop(assertCurrent?: DispatchGuard) {
    assertCurrent?.();
    this.revision++;
    // Keep the notification generation active: stopping cancels writes, not telemetry.
    if (this.stopping) throw new BaseError('Stop already in progress', 409);
    this.stopping = true;
    try {
      await this.write(stopPacket(), undefined, assertCurrent);
    } finally {
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
