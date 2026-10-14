
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="ba6b2257-e1a1-5f29-9d58-a110912800b1")}catch(e){}}();
import { HapStatusError } from 'hap-nodejs';
export function communicationError(error) {
    return error instanceof HapStatusError ? error : new HapStatusError(-70402 /* HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
}
// Invalidate both sides before and after a write, including partial failures and reads already in flight.
export class HomeKitStatusReader {
    load;
    now;
    generation = 0;
    writes = 0;
    disposed = false;
    snapshot;
    reading;
    constructor(load, now = () => performance.now()) {
        this.load = load;
        this.now = now;
    }
    assertActive() {
        if (this.disposed)
            throw new HapStatusError(-70402 /* HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
    }
    isCurrent(value) {
        return !this.disposed && this.writes === 0 && this.snapshot?.value === value;
    }
    invalidate() {
        this.generation += 1;
        this.snapshot = undefined;
        this.reading = undefined;
    }
    async read() {
        this.assertActive();
        if (this.writes)
            throw new HapStatusError(-70403 /* HAPStatus.RESOURCE_BUSY */);
        if (this.snapshot && this.now() - this.snapshot.time < 5000)
            return this.snapshot.value;
        if (this.reading)
            return this.reading;
        const generation = this.generation;
        const reading = Promise.resolve().then(() => {
            this.assertActive();
            return this.load();
        }).then(value => {
            this.assertActive();
            if (generation !== this.generation)
                throw new HapStatusError(-70403 /* HAPStatus.RESOURCE_BUSY */);
            this.snapshot = { value, time: this.now() };
            return value;
        }).catch(error => { throw communicationError(error); });
        this.reading = reading;
        try {
            return await reading;
        }
        catch (error) {
            throw communicationError(error);
        }
        finally {
            if (this.reading === reading)
                this.reading = undefined;
        }
    }
    async write(action) {
        this.assertActive();
        this.writes += 1;
        this.invalidate();
        try {
            await action();
        }
        catch (error) {
            throw communicationError(error);
        }
        finally {
            this.writes -= 1;
            this.invalidate();
        }
    }
    dispose() {
        this.disposed = true;
        this.invalidate();
    }
}
//# sourceMappingURL=status.js.map
//# debugId=ba6b2257-e1a1-5f29-9d58-a110912800b1
