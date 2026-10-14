import settingsDB from '../db/settings.js';
import schedulesDB from '../db/schedules.js';
import type { DayOfWeek, Side } from '../db/schedulesSchema.js';

// A persisted edit may precede the filesystem watcher's cancellation of old jobs.
export async function currentRoutine(timeZone: string, side: Side, day: DayOfWeek) {
  await Promise.all([settingsDB.read(), schedulesDB.read()]);
  const routine = schedulesDB.data[side][day];
  if (settingsDB.data.timeZone !== timeZone || settingsDB.data[side].awayMode || !routine.power.enabled) return null;
  return routine;
}
