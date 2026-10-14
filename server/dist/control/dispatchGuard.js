// Check at the actual write boundary: queued work can outlive the process that requested it.

!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="fbe8d112-2065-5d98-8fbe-ac122ac2d977")}catch(e){}}();
export function createDispatchGuard(signal, deadline, now = Date.now) {
    return () => {
        if (signal.aborted || now() > deadline)
            throw new Error('Control request expired or was cancelled');
    };
}
//# sourceMappingURL=dispatchGuard.js.map
//# debugId=fbe8d112-2065-5d98-8fbe-ac122ac2d977
