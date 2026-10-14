
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="79f9ac50-e4ac-5b10-b5c2-81d491060dd6")}catch(e){}}();
import settingsDB from '../db/settings.js';
import schedulesDB from '../db/schedules.js';
// A persisted edit may precede the filesystem watcher's cancellation of old jobs.
export async function currentRoutine(timeZone, side, day) {
    await Promise.all([settingsDB.read(), schedulesDB.read()]);
    const routine = schedulesDB.data[side][day];
    if (settingsDB.data.timeZone !== timeZone || settingsDB.data[side].awayMode || !routine.power.enabled)
        return null;
    return routine;
}
//# sourceMappingURL=current.js.map
//# debugId=79f9ac50-e4ac-5b10-b5c2-81d491060dd6
