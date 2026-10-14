import schedule from 'node-schedule';
import cbor from 'cbor';
import moment from 'moment-timezone';

import logger from '../logger.js';
import memoryDB from '../db/memoryDB.js';
import serverStatus from '../serverStatus.js';
import schedulesDB from '../db/schedules.js';
import settingsDB from '../db/settings.js';
import { AlarmJob, DailySchedule, DayOfWeek, Side } from '../db/schedulesSchema.js';
import { executeFunction } from '../8sleep/deviceApi.js';
import { getDayIndexForSchedule, logJob } from './utils.js';
import { connectFranken } from '../8sleep/frankenServer.js';
import { Settings } from '../db/settingsSchema.js';
import { alarmRule, overrideOccurrence } from '../alarms/timing.js';
import { isCurrentOverride, overrideAlarmProfile } from '../alarms/overrides.js';


export const executeAlarm = async ({ vibrationIntensity, duration, vibrationPattern, side, force=false }: AlarmJob) => {
  try {
    const min10Duration = Math.max(10, duration);
    // Exit is side is in away mode
    await settingsDB.read();
    if (settingsDB.data[side].awayMode && !force) {
      if (settingsDB.data[side].awayMode) {
        logger.debug('Not executing alarm, this side is in away mode!');
        return;
      }
    }

    // Exit if side is off
    const franken = await connectFranken();
    const resp = await franken.getDeviceStatus();
    if (!resp[side].isOn && !force) {
      logger.debug('Not executing alarm, side is off!');
      return;
    }

    const currentTime = moment.tz(settingsDB.data.timeZone);
    const alarmTimeEpoch = currentTime.unix();

    const alarmPayload = {
      pl: vibrationIntensity,
      du: min10Duration,
      pi: vibrationPattern,
      tt: alarmTimeEpoch,
    };

    const cborPayload = cbor.encode(alarmPayload);
    const hexPayload = cborPayload.toString('hex');
    const command = side === 'left' ? 'ALARM_LEFT' : 'ALARM_RIGHT';

    logger.debug(`Executing alarm... ${JSON.stringify(alarmPayload)}`);
    await executeFunction(command, hexPayload);
    await memoryDB.read();
    memoryDB.data[side].isAlarmVibrating = true;
    await memoryDB.write();

    setTimeout(
      async () => {
        logger.debug('');
        await memoryDB.read();
        memoryDB.data[side].isAlarmVibrating = false;
        await memoryDB.write();
      },
      min10Duration * 1_000
    );
    serverStatus.status.alarmSchedule.status = 'healthy';
    serverStatus.status.alarmSchedule.message = '';
  } catch (error: unknown) {
    serverStatus.status.alarmSchedule.status = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    serverStatus.status.alarmSchedule.message = message;
    logger.error(error);
  }
};


export function scheduleAlarmOverride(settingsData: Settings, side: Side) {
  if (settingsData[side].awayMode) return null;
  const alarmOverride = settingsData[side]?.scheduleOverrides?.alarm;
  if (!alarmOverride) return null;
  const occurrence = overrideOccurrence(alarmOverride, settingsData.timeZone, Date.now());
  if (!occurrence) return null;
  const next = moment.tz(occurrence, settingsData.timeZone);
  logger.debug(`Alarm override is set! Scheduling alarm for ${next.format()}`);

  return schedule.scheduleJob(`${side}-alarm-override-${alarmOverride.timeOverride}`, next.toDate(), async () => {
    await settingsDB.read();
    const current = settingsDB.data[side].scheduleOverrides.alarm;
    // A settings write may arrive before the filesystem watcher cancels this callback.
    if (!isCurrentOverride(alarmOverride, current, Date.now())) return;
    await schedulesDB.read();
    const { vibrationIntensity, duration, vibrationPattern } = overrideAlarmProfile(
      alarmOverride, schedulesDB.data[side], occurrence, settingsData.timeZone
    );

    await executeAlarm({
      side,
      vibrationIntensity,
      duration,
      vibrationPattern,
    });
  });
}


export const scheduleAlarm = (settingsData: Settings, side: Side, day: DayOfWeek, dailySchedule: DailySchedule) => {
  if (!dailySchedule.power.enabled) return;
  if (!dailySchedule.alarm.enabled) return;
  if (settingsData[side].awayMode) return;
  if (settingsData.timeZone === null) return;

  const recurrence = alarmRule(day, dailySchedule, settingsData.timeZone);
  const dayIndex = getDayIndexForSchedule(day, dailySchedule.alarm.time, dailySchedule.power.on);
  const { time } = dailySchedule.alarm;

  logJob('Scheduling alarm job', side, day, dayIndex, time);

  schedule.scheduleJob(`${side}-${day}-${time}-alarm`, recurrence, async () => {
    try {
      logJob('Executing alarm job', side, day, dayIndex, time);
      await settingsDB.read();

      if (settingsDB.data[side].scheduleOverrides.alarm.expiresAt) {
        const expiresAt = moment(settingsDB.data[side].scheduleOverrides.alarm.expiresAt);
        const now = moment();
        if (expiresAt.isAfter(now)) {
          logJob(`Detected alarm override! Skipping alarm! Override expires at: ${expiresAt.format()}`, side, day, dayIndex, time);
          return;
        }
      }

      await executeAlarm({
        side,
        vibrationIntensity: dailySchedule.alarm.vibrationIntensity,
        duration: dailySchedule.alarm.duration,
        vibrationPattern: dailySchedule.alarm.vibrationPattern,
      });
    } catch (error: unknown) {
      serverStatus.status.alarmSchedule.status = 'failed';
      const message = error instanceof Error ? error.message : String(error);
      serverStatus.status.alarmSchedule.message = message;
      logger.error(error);
    }
  });
};

