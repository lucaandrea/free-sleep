import type { SideSchedule } from '../db/schedulesSchema.js';
import { routineAt, PRESENCE_MAX_AGE_MS, type PresenceReading, type RoutineWindow } from '../thermal/policy.js';

export function entryShift(window: RoutineWindow, presence: PresenceReading, now: number): number | null {
  const entered = Date.parse(presence.presentSince ?? '');
  const age = now - Date.parse(presence.lastUpdatedAt ?? '');
  if (!presence.present || !Number.isFinite(entered) || !Number.isFinite(age) || age < 0 || age > PRESENCE_MAX_AGE_MS
    || entered > now - 10 * 60_000 || Math.abs(entered - window.start) > 90 * 60_000) return null;
  return Math.max(-30, Math.min(30, Math.round((entered - window.start) / 60_000)));
}

// Shift only intermediate temperature phases. Keep power, wake time, alarms and the routine boundary fixed.
export function phaseAdjustedWindow(
  original: RoutineWindow, schedules: SideSchedule, zone: string, now: number, shiftMinutes: number,
): RoutineWindow {
  const shifted = routineAt(schedules, zone, now - shiftMinutes * 60_000);
  if (shifted?.session !== original.session) return original;
  return { ...original, baselineF: shifted.baselineF,
    segment: `${original.segment}:phase:${shifted.segment}:${shiftMinutes}` };
}
