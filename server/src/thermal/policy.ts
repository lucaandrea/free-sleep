import moment from 'moment-timezone';
import type { JournalEntry } from '../analytics/journal.js';
import type { DailySchedule, DayOfWeek, SideSchedule } from '../db/schedulesSchema.js';
import type { SideSettings } from '../db/settingsSchema.js';
import type { DeviceStatus } from '../routes/deviceStatus/deviceStatusSchema.js';
import type { ComfortDecision, ComfortState } from './types.js';

export const MANUAL_PAUSE_MS = 6 * 60 * 60 * 1000;
export const ADJUSTMENT_INTERVAL_MS = 30 * 60 * 1000;
export const PRESENCE_MAX_AGE_MS = 90_000;
export type RoutineWindow = { session: string; segment: string; start: number; end: number; baselineF: number; alarmAt: number | null };
export type PresenceReading = { present: boolean; lastUpdatedAt?: string; presentSince?: string };

// Anchor wall-clock times to the routine's start date, including overnight and DST transitions.
function occurrence(date: string, time: string, startTime: string, zone: string) {
  const day = moment.tz(date, 'YYYY-MM-DD', zone);
  if (time < startTime) day.add(1, 'day');
  return moment.tz(`${day.format('YYYY-MM-DD')} ${time}`, 'YYYY-MM-DD HH:mm', zone).valueOf();
}
export function routineAt(schedules: SideSchedule, zone: string, now: number): RoutineWindow | null {
  if (!moment.tz.zone(zone)) return null;
  const today = moment.tz(now, zone).startOf('day');
  const windows: RoutineWindow[] = [];
  for (const daysAgo of [0, 1]) {
    const date = today.clone().subtract(daysAgo, 'days').format('YYYY-MM-DD');
    const day = moment.tz(date, 'YYYY-MM-DD', zone).format('dddd').toLowerCase() as DayOfWeek;
    const schedule: DailySchedule = schedules[day];
    if (!schedule?.power.enabled || schedule.power.on === schedule.power.off) continue;
    const start = occurrence(date, schedule.power.on, schedule.power.on, zone);
    const end = occurrence(date, schedule.power.off, schedule.power.on, zone);
    if (now < start || now >= end || end <= start) continue;
    const changes = [{ at: start, temperature: schedule.power.onTemperature }, ...Object.entries(schedule.temperatures)
      .map(([time, temperature]) => ({ at: occurrence(date, time, schedule.power.on, zone), temperature }))]
      .filter(change => change.at >= start && change.at < end && change.at <= now).sort((first, second) => first.at - second.at);
    const current = changes.at(-1)!;
    const alarmAt = schedule.alarm.enabled ? occurrence(date, schedule.alarm.time, schedule.power.on, zone) : null;
    windows.push({ session: `${date}:${start}`, segment: `${start}:${end}:${current.at}:${current.temperature}`, start, end,
      baselineF: current.temperature, alarmAt });
  }
  // Overlapping routines are ambiguous; leave their existing scheduled commands in control.
  return windows.length === 1 ? windows[0] : null;
}

// Consume each check-in once, learning at most one degree per session from at least three new reports.
export function learnComfort(state: ComfortState, entries: JournalEntry[], window: RoutineWindow, zone: string, now: number) {
  if (state.learnedSession === window.session) return null;
  state.learnedSession = window.session;
  const today = moment.tz(now, zone).format('YYYY-MM-DD');
  const since = moment.tz(now, zone).subtract(14, 'days').format('YYYY-MM-DD');
  const recent = [...new Map(entries.filter(entry => entry.date > state.feedbackThrough && entry.date >= since && entry.date <= today)
    .map(entry => [entry.date, entry])).values()].sort((first, second) => first.date.localeCompare(second.date));
  if (recent.length < 3) return null;
  const threshold = Math.ceil(recent.length * 2 / 3);
  const warm = recent.filter(entry => entry.comfort === 'warm').length;
  const cold = recent.filter(entry => entry.comfort === 'cold').length;
  const change = warm >= threshold ? -1 : cold >= threshold ? 1 : 0;
  state.offsetF = Math.max(-3, Math.min(3, state.offsetF + change));
  state.feedbackThrough = recent.at(-1)!.date;
  const adjustment = `${state.offsetF > 0 ? '+' : ''}${state.offsetF}°F`;
  return `Reviewed ${recent.length} new check-ins: ${warm} warm, ${cold} cold. Learned adjustment ${adjustment}.`;
}

export function decideComfort(input: {
  state: ComfortState; window: RoutineWindow | null; now: number; presence: PresenceReading;
  device: DeviceStatus; side: 'left' | 'right'; preferences: SideSettings; eitherAway: boolean;
}): ComfortDecision {
  const { state, window, now, presence, device, side, preferences, eitherAway } = input;
  const baselineF = window?.baselineF ?? null;
  const proposedF = baselineF === null ? null : Math.max(state.config.minimumF, Math.min(state.config.maximumF, baselineF + state.offsetF));
  const stop = (reason: string): ComfortDecision => ({ reason, baselineF, proposedF, eligible: false });
  if (state.config.mode === 'off') return stop('Adaptive comfort is off.');
  if (state.pausedUntil > now) return stop('Paused for six hours after a manual control. Your routine continues.');
  if (eitherAway) return stop('Paused while either side is in away mode.');
  if (!window) return stop('Waiting for one enabled routine with a clear start and end.');
  if (baselineF! < state.config.minimumF || baselineF! > state.config.maximumF) return stop('Routine target is outside your comfort limits.');
  const override = preferences.scheduleOverrides.temperatureSchedules;
  if (override.disabled && Date.parse(override.expiresAt) > now) return stop('Temperature routines are paused.');
  const alarmOverride = preferences.scheduleOverrides.alarm;
  if (alarmOverride.expiresAt && Date.parse(alarmOverride.expiresAt) > now) return stop('An alarm override is active.');
  if (window.alarmAt !== null && now >= window.alarmAt - 30 * 60 * 1000) {
    return stop('Leaving the final half-hour before your alarm to your routine.');
  }
  if (device.isPriming || device[side].isAlarmVibrating) return stop('Paused during priming or an alarm.');
  if (device.waterLevel !== 'true') return stop('Waiting for a confirmed adequate water level.');
  if (!device[side].isOn) return stop('Your side is off. Adaptive comfort never turns it on.');
  const age = now - Date.parse(presence.lastUpdatedAt ?? '');
  if (!Number.isFinite(age) || age < 0 || age > PRESENCE_MAX_AGE_MS) return stop('Waiting for fresh presence readings.');
  if (!presence.present) return stop('Waiting until your side is occupied.');
  if (state.lastAppliedAt && (now < state.lastAppliedAt || now - state.lastAppliedAt < ADJUSTMENT_INTERVAL_MS)) {
    return stop('Waiting between adjustments (30 minutes).');
  }
  return { baselineF, proposedF, eligible: true,
    reason: state.config.mode === 'preview' ? 'Preview only. No temperatures will change.'
      : 'Following your routine with the learned comfort adjustment.' };
}
