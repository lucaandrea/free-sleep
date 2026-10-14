
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="319ff9d0-9505-5845-988b-a2d3f9dbb441")}catch(e){}}();
let handler = null;
export function registerComfortController(controller) { handler = controller; }
export function coordinateTemperature(command, source, apply) {
    if (handler)
        return handler(command, source, apply);
    return source === 'adaptive' ? Promise.resolve() : apply(command);
}
//# sourceMappingURL=coordinator.js.map
//# debugId=319ff9d0-9505-5845-988b-a2d3f9dbb441
