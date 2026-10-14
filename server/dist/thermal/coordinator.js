
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="bad52e76-2ff4-5832-88f7-30b5e09d6a88")}catch(e){}}();
let handler = null;
export function registerComfortController(controller) { handler = controller; }
export function coordinateTemperature(command, source, apply, assertCurrent) {
    assertCurrent?.();
    if (handler)
        return handler(command, source, apply, assertCurrent);
    return source === 'adaptive' ? Promise.resolve() : apply(command);
}
//# sourceMappingURL=coordinator.js.map
//# debugId=bad52e76-2ff4-5832-88f7-30b5e09d6a88
