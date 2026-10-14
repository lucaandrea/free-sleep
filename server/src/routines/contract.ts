import { z } from 'zod';
import {
  DailyScheduleSchema,
  SideScheduleSchema,
  SideSchema,
  type DailySchedule,
  type DayOfWeek,
  type Schedules,
} from '../db/schedulesSchema.js';

export const ROUTINE_DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export const RoutineSaveSchema = z
  .object({
    side: SideSchema,
    days: z.array(SideScheduleSchema.keyof()).min(1).max(7),
    schedule: DailyScheduleSchema,
    expected: z.record(SideScheduleSchema.keyof(), DailyScheduleSchema),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.days).size === input.days.length &&
      Object.keys(input.expected).length === input.days.length &&
      input.days.every((day) => input.expected[day]),
    { message: 'Include the original routine for every selected day.' },
  );
export type RoutineSave = z.infer<typeof RoutineSaveSchema>;
export class RoutineConflict extends Error {}
export class RoutineValidationError extends Error {}

export function clockMinutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}
export const minutesAfter = (time: string, start: string) => (clockMinutes(time) - clockMinutes(start) + 1440) % 1440;
export function routineProblems(schedule: DailySchedule): string[] {
  if (!DailyScheduleSchema.safeParse(schedule).success)
    return ['Use valid 24-hour times, temperatures from 55–110°F and valid alarm settings.'];
  if (!schedule.power.enabled) return [];
  const duration = minutesAfter(schedule.power.off, schedule.power.on);
  const problems: string[] = [];
  if (!duration) problems.push('Turn-on and turn-off times must be different.');
  for (const time of Object.keys(schedule.temperatures)) {
    const offset = minutesAfter(time, schedule.power.on);
    if (!(offset > 0 && offset < duration)) problems.push(`Adjustment ${time} must fall between turn-on and turn-off.`);
  }
  if (schedule.alarm.enabled) {
    const offset = minutesAfter(schedule.alarm.time, schedule.power.on);
    if (!(offset > 0 && offset < duration))
      problems.push('The vibration alarm must fall between turn-on and turn-off.');
  }
  return problems;
}
export function routinesEqual(first: DailySchedule, second: DailySchedule): boolean {
  const values = (item: DailySchedule) => [
    item.power.on,
    item.power.off,
    item.power.enabled,
    item.power.onTemperature,
    item.alarm.time,
    item.alarm.enabled,
    item.alarm.alarmTemperature,
    item.alarm.duration,
    item.alarm.vibrationIntensity,
    item.alarm.vibrationPattern,
    Object.entries(item.temperatures).sort(([first], [second]) => first.localeCompare(second)),
  ];
  return JSON.stringify(values(first)) === JSON.stringify(values(second));
}

// Compare every target before copying anything; concurrent edits fail as one atomic request.
export function applyRoutine(schedules: Schedules, input: RoutineSave): void {
  for (const day of input.days) {
    if (!input.expected[day] || !routinesEqual(schedules[input.side][day], input.expected[day]!)) {
      throw new RoutineConflict(
        `${day.charAt(0).toUpperCase() + day.slice(1)} changed on another client. Reload saved routines before saving.`,
      );
    }
  }
  const problems = routineProblems(input.schedule);
  if (problems.length) throw new RoutineValidationError(problems.join(' '));
  for (const day of input.days) schedules[input.side][day] = structuredClone(input.schedule);
}

export interface RoutinePoint {
  time: string;
  minutes: number;
  temperature: number;
}
export function routinePoints(schedule: DailySchedule): RoutinePoint[] {
  const duration = minutesAfter(schedule.power.off, schedule.power.on);
  if (!duration || !Number.isFinite(duration)) return [];
  const points = [
    { time: schedule.power.on, minutes: 0, temperature: schedule.power.onTemperature },
    ...Object.entries(schedule.temperatures)
      .map(([time, temperature]) => ({ time, temperature, minutes: minutesAfter(time, schedule.power.on) }))
      .filter((point) => point.minutes > 0 && point.minutes < duration)
      .sort((first, second) => first.minutes - second.minutes),
  ];
  return [
    ...points,
    { time: schedule.power.off, minutes: duration, temperature: points[points.length - 1].temperature },
  ];
}
