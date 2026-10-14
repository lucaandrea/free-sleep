import schedule from 'node-schedule';
import type { DailySchedule, DayOfWeek, Side, Schedules } from '../db/schedulesSchema.js';
import type { Settings } from '../db/settingsSchema.js';
import { getDayIndexForSchedule } from '../jobs/scheduleTiming.js';
import type { AlarmChange, AlarmOccurrence } from './types.js';
import { buildAlarmPreview, changeAlarmFromPreview } from './overrides.js';
export { overrideOccurrence, resolveAlarmTime } from './overrides.js';

// Use the actual scheduler rule for preview dates, including its DST behavior.
export function alarmRule(day: DayOfWeek, daily: DailySchedule, timeZone: string) {
  const rule = new schedule.RecurrenceRule();
  rule.dayOfWeek = getDayIndexForSchedule(day, daily.alarm.time, daily.power.on);
  const [hour, minute] = daily.alarm.time.split(':').map(Number);
  rule.hour = hour; rule.minute = minute; rule.tz = timeZone;
  return rule;
}

export function nextRoutineAlarm(settings: Settings, schedules: Schedules, side: Side, now: number): AlarmOccurrence | null {
  const candidates = (Object.entries(schedules[side]) as [DayOfWeek, DailySchedule][]).flatMap(([day, daily]) => {
    if (!daily.power.enabled || !daily.alarm.enabled) return [];
    const next = alarmRule(day, daily, settings.timeZone).nextInvocationDate(new Date(now));
    return next ? [{ at: next.toISOString(), time: daily.alarm.time, scheduleDay: day, source: 'routine' as const }] : [];
  });
  return candidates.sort((first, second) => first.at.localeCompare(second.at))[0] ?? null;
}

export function previewAlarm(settings: Settings, schedules: Schedules, side: Side, now = Date.now()) {
  return buildAlarmPreview(settings, side, nextRoutineAlarm(settings, schedules, side, now), now);
}

export function changeAlarm(settings: Settings, schedules: Schedules, change: AlarmChange, now = Date.now()) {
  return changeAlarmFromPreview(settings, change, previewAlarm(settings, schedules, change.side, now), now);
}
