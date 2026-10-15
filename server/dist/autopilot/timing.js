
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="77d51a6d-a26e-56d9-afe6-23ce1d23fee5")}catch(e){}}();
import { routineAt, PRESENCE_MAX_AGE_MS } from '../thermal/policy.js';
export function entryShift(window, presence, now) {
    const entered = Date.parse(presence.presentSince ?? '');
    const age = now - Date.parse(presence.lastUpdatedAt ?? '');
    if (!presence.present || !Number.isFinite(entered) || !Number.isFinite(age) || age < 0 || age > PRESENCE_MAX_AGE_MS
        || entered > now - 10 * 60_000 || Math.abs(entered - window.start) > 90 * 60_000)
        return null;
    return Math.max(-30, Math.min(30, Math.round((entered - window.start) / 60_000)));
}
// Shift only intermediate temperature phases. Keep power, wake time, alarms and the routine boundary fixed.
export function phaseAdjustedWindow(original, schedules, zone, now, shiftMinutes) {
    const shifted = routineAt(schedules, zone, now - shiftMinutes * 60_000);
    if (shifted?.session !== original.session)
        return original;
    return { ...original, baselineF: shifted.baselineF,
        segment: `${original.segment}:phase:${shifted.segment}:${shiftMinutes}` };
}
//# sourceMappingURL=timing.js.map
//# debugId=77d51a6d-a26e-56d9-afe6-23ce1d23fee5
