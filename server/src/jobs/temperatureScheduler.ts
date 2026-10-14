import schedule from 'node-schedule';

import { DailySchedule, DayOfWeek, Side, Time } from '../db/schedulesSchema.js';
import { getDayIndexForSchedule, logJob } from './utils.js';
import { Settings } from '../db/settingsSchema.js';
import { TimeZone } from '../db/timeZones.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import serverStatus from '../serverStatus.js';
import logger from '../logger.js';
import { currentRoutine } from '../routines/current.js';
import { minutesAfter } from '../routines/contract.js';


const scheduleAdjustment = (
  timeZone: TimeZone, side: Side, day: DayOfWeek, time: Time, temperature: number, powerOnTime: Time, send: typeof updateDeviceStatus
) => {
  const onRule = new schedule.RecurrenceRule();

  const dayOfWeekIndex = getDayIndexForSchedule(day, time, powerOnTime);
  const [onHour, onMinute] = time.split(':').map(Number);
  logJob('Scheduling temperature adjustment job', side, day, dayOfWeekIndex, time);

  onRule.dayOfWeek = dayOfWeekIndex;
  onRule.hour = onHour;
  onRule.minute = onMinute;
  onRule.tz = timeZone;

  schedule.scheduleJob(`${side}-${day}-${time}-${temperature}-temperature-adjustment`, onRule, async () => {
    try {
      const current = await currentRoutine(timeZone, side, day);
      if (!current) return;
      const offset = minutesAfter(time, current.power.on);
      // Ignore a callback disabled or edited before the filesystem watcher refreshed its job.
      if (current.power.on !== powerOnTime
        || current.temperatures[time] !== temperature
        || !(offset > 0 && offset < minutesAfter(current.power.off, current.power.on))) return;
      logJob('Executing temperature adjustment job', side, day, dayOfWeekIndex, time);
      await send({
        [side]: {
          targetTemperatureF: temperature,
        }
      }, 'schedule');
      serverStatus.status.temperatureSchedule.status = 'healthy';
      serverStatus.status.temperatureSchedule.message = '';
    } catch (error: unknown) {
      serverStatus.status.temperatureSchedule.status = 'failed';
      const message = error instanceof Error ? error.message : String(error);
      serverStatus.status.temperatureSchedule.message = message;
      logger.error(error);
    }
  });
};

export const scheduleTemperatures = (
  settingsData: Settings, side: Side, day: DayOfWeek, dailySchedule: DailySchedule, send = updateDeviceStatus
) => {
  if (!dailySchedule.power.enabled) return;
  if (settingsData[side].awayMode) return;
  const { timeZone } = settingsData;
  if (timeZone === null) return;

  Object.entries(dailySchedule.temperatures).forEach(([time, temperature]) => {
    const offset = minutesAfter(time, dailySchedule.power.on);
    if (!(offset > 0 && offset < minutesAfter(dailySchedule.power.off, dailySchedule.power.on))) return;
    scheduleAdjustment(timeZone, side, day, time, temperature, dailySchedule.power.on, send);
  });
};
