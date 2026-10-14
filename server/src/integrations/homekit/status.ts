import { HAPStatus, HapStatusError } from 'hap-nodejs';
import type { DeviceStatus } from '../../routes/deviceStatus/deviceStatusSchema.js';

export function communicationError(error: unknown): HapStatusError {
  return error instanceof HapStatusError ? error : new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
}

// Invalidate both sides before and after a write, including partial failures and reads already in flight.
export class HomeKitStatusReader {
  private generation = 0;
  private writes = 0;
  private disposed = false;
  private snapshot?: { value: DeviceStatus; time: number };
  private reading?: Promise<DeviceStatus>;

  constructor(private readonly load: () => Promise<DeviceStatus>, private readonly now = () => performance.now()) {}

  assertActive() {
    if (this.disposed) throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  isCurrent(value: DeviceStatus) {
    return !this.disposed && this.writes === 0 && this.snapshot?.value === value;
  }

  private invalidate() {
    this.generation += 1;
    this.snapshot = undefined;
    this.reading = undefined;
  }

  async read(): Promise<DeviceStatus> {
    this.assertActive();
    if (this.writes) throw new HapStatusError(HAPStatus.RESOURCE_BUSY);
    if (this.snapshot && this.now() - this.snapshot.time < 5000) return this.snapshot.value;
    if (this.reading) return this.reading;
    const generation = this.generation;
    const reading = Promise.resolve().then(() => {
      this.assertActive();
      return this.load();
    }).then(value => {
      this.assertActive();
      if (generation !== this.generation) throw new HapStatusError(HAPStatus.RESOURCE_BUSY);
      this.snapshot = { value, time: this.now() };
      return value;
    }).catch(error => { throw communicationError(error); });
    this.reading = reading;
    try {
      return await reading;
    } catch (error) {
      throw communicationError(error);
    } finally {
      if (this.reading === reading) this.reading = undefined;
    }
  }

  async write(action: () => Promise<unknown>): Promise<void> {
    this.assertActive();
    this.writes += 1;
    this.invalidate();
    try {
      await action();
    } catch (error) {
      throw communicationError(error);
    } finally {
      this.writes -= 1;
      this.invalidate();
    }
  }

  dispose() {
    this.disposed = true;
    this.invalidate();
  }
}
