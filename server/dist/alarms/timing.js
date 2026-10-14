
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="aeb5ff0c-aac0-57ef-9aad-5a3ae50b434c")}catch(e){}}();
import schedule from 'node-schedule';
import { getDayIndexForSchedule } from '../jobs/scheduleTiming.js';
import { buildAlarmPreview, changeAlarmFromPreview } from './overrides.js';
export { overrideOccurrence, resolveAlarmTime } from './overrides.js';
// Use the actual scheduler rule for preview dates, including its DST behavior.
export function alarmRule(day, daily, timeZone) {
    const rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = getDayIndexForSchedule(day, daily.alarm.time, daily.power.on);
    const [hour, minute] = daily.alarm.time.split(':').map(Number);
    rule.hour = hour;
    rule.minute = minute;
    rule.tz = timeZone;
    return rule;
}
export function nextRoutineAlarm(settings, schedules, side, now) {
    const candidates = Object.entries(schedules[side]).flatMap(([day, daily]) => {
        if (!daily.power.enabled || !daily.alarm.enabled)
            return [];
        const next = alarmRule(day, daily, settings.timeZone).nextInvocationDate(new Date(now));
        return next ? [{ at: next.toISOString(), time: daily.alarm.time, scheduleDay: day, source: 'routine' }] : [];
    });
    return candidates.sort((first, second) => first.at.localeCompare(second.at))[0] ?? null;
}
export function previewAlarm(settings, schedules, side, now = Date.now()) {
    return buildAlarmPreview(settings, side, nextRoutineAlarm(settings, schedules, side, now), now);
}
export function changeAlarm(settings, schedules, change, now = Date.now()) {
    return changeAlarmFromPreview(settings, change, previewAlarm(settings, schedules, change.side, now), now);
}
//# sourceMappingURL=timing.js.map
//# debugId=aeb5ff0c-aac0-57ef-9aad-5a3ae50b434c
