import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { SchedulesSchema, type Schedules } from '../src/db/schedulesSchema.js';
import { applyRoutine, minutesAfter, ROUTINE_DAYS, RoutineSaveSchema, routinePoints, routineProblems } from '../src/routines/contract.js';
import { alarmFixture } from './fixtures/alarms.js';

const fixture = async () => SchedulesSchema.parse(JSON.parse(await readFile(new URL('../../shared/fixtures/routines-demo.json', import.meta.url), 'utf8')));

test('routine timing and chart preserve the overnight sequence without a local-date heuristic', async () => {
  const routine = (await fixture()).left.monday;
  assert.equal(minutesAfter('02:00', '22:00'), 240);
  assert.deepEqual(routinePoints(routine).map(point => [point.time, point.minutes, point.temperature]), [
    ['22:00', 0, 80], ['23:00', 60, 78], ['02:00', 240, 76], ['06:00', 480, 80], ['08:00', 600, 80],
  ]);
  assert.deepEqual(routineProblems(routine), []);
  routine.power.on = '13:00'; routine.power.off = '19:00'; routine.temperatures = { '14:00': 78 }; routine.alarm.time = '18:00';
  assert.deepEqual(routineProblems(routine), []);
  routine.alarm.time = '19:00'; assert.match(routineProblems(routine).join(), /vibration alarm/);
  routine.temperatures = { '12:00': 78, '13:00': 80 }; assert.equal(routineProblems(routine).length, 3);
  routine.power.off = '13:00'; assert.match(routineProblems(routine).join(), /different/);
  routine.power.enabled = false; assert.deepEqual(routineProblems(routine), []);
});

test('copy weekdays means Monday through Friday and never changes the other side or weekend', async () => {
  const schedules = await fixture(); const before = structuredClone(schedules);
  const days = ROUTINE_DAYS.slice(0, 5);
  const schedule = structuredClone(schedules.left.monday); schedule.temperatures = {}; schedule.alarm.enabled = false; schedule.power.enabled = false;
  const input = RoutineSaveSchema.parse({ side: 'left', days, schedule, expected: Object.fromEntries(days.map(day => [day, before.left[day]])) });
  applyRoutine(schedules, input);
  assert.deepEqual(schedules.right, before.right);
  for (const day of days) assert.deepEqual(schedules.left[day], schedule);
  assert.deepEqual(schedules.left.saturday, before.left.saturday); assert.deepEqual(schedules.left.sunday, before.left.sunday);
  schedules.left.monday.power.onTemperature = 75;
  assert.equal(schedules.left.tuesday.power.onTemperature, 80);
});

test('a stale copy target rejects the entire update', async () => {
  const schedules = await fixture();
  const input = RoutineSaveSchema.parse({ side: 'left', days: ['monday', 'tuesday'], schedule: schedules.left.monday,
    expected: { monday: schedules.left.monday, tuesday: schedules.left.tuesday } });
  schedules.left.tuesday.power.onTemperature = 77;
  const before = structuredClone(schedules);
  assert.throws(() => applyRoutine(schedules, input), /Tuesday changed/);
  assert.deepEqual(schedules, before);
  assert.equal(RoutineSaveSchema.safeParse({ ...input, days: ['monday', 'monday'] }).success, false);
  assert.equal(RoutineSaveSchema.safeParse({ ...input, expected: { monday: input.expected.monday } }).success, false);
});

test('routine routes preserve partial alarms, delete adjustments and reject concurrent stale copies', async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'free-sleep-routines-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'lowdb'));
  const schedules = await fixture();
  await writeFile(path.join(directory, 'lowdb/schedulesDB.json'), JSON.stringify(schedules));
  await writeFile(path.join(directory, 'lowdb/settingsDB.json'), JSON.stringify(alarmFixture().settings));
  process.env.DATA_FOLDER = `${directory}/`; process.env.ENV = 'local';
  const { default: router } = await import('../src/routes/schedules/schedules.js');
  const app = express(); app.use(express.json()); app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}/api`;
  const post = (route: string, body: unknown) => fetch(`${origin}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const partial = await post('schedules', { left: { monday: { alarm: { enabled: false } } } });
  assert.equal(partial.status, 200);
  let current = await partial.json() as Schedules;
  assert.equal(current.left.monday.alarm.duration, 60); assert.equal(current.left.monday.alarm.time, '07:00');
  const updated = structuredClone(current.left.monday); updated.temperatures = {}; updated.power.onTemperature = 79;
  const request = { side: 'left', days: ['monday', 'tuesday'], schedule: updated, expected: { monday: current.left.monday, tuesday: current.left.tuesday } };
  const writes = await Promise.all([post('schedules/routine', request), post('schedules/routine', request)]);
  assert.deepEqual(writes.map(result => result.status).sort(), [200, 409]);
  current = await (await fetch(`${origin}/schedules`)).json() as Schedules;
  assert.deepEqual(current.left.monday.temperatures, {}); assert.equal(current.left.tuesday.power.onTemperature, 79);
  assert.deepEqual(current.right, schedules.right); assert.deepEqual(current.left.wednesday, schedules.left.wednesday);
  const scheduler = await import('node-schedule');
  const { scheduleTemperatures } = await import('../src/jobs/temperatureScheduler.js');
  const disabled = structuredClone(schedules.left.monday); disabled.power.enabled = false;
  scheduleTemperatures(alarmFixture().settings, 'left', 'monday', disabled);
  assert.equal(Object.keys(scheduler.default.scheduledJobs).length, 0);

  const bad = await post('schedules/routine', { ...request, expected: { monday: current.left.monday, tuesday: current.left.tuesday },
    schedule: { ...updated, alarm: { ...updated.alarm, enabled: true, time: updated.power.off } } });
  assert.equal(bad.status, 400);
  assert.deepEqual(await (await fetch(`${origin}/schedules`)).json(), current);

  const { schedulePowerOn, schedulePowerOffAndSleepAnalysis } = await import('../src/jobs/powerScheduler.js');
  const { scheduleAlarm } = await import('../src/jobs/alarmScheduler.js');
  const settings = alarmFixture().settings;
  const sent: string[] = [];
  const original = schedules.left.monday;
  const persist = async (book = schedules, preferences = settings) => {
    await writeFile(path.join(directory, 'lowdb/schedulesDB.json'), JSON.stringify(book));
    await writeFile(path.join(directory, 'lowdb/settingsDB.json'), JSON.stringify(preferences));
  };
  await persist();
  schedulePowerOn(settings, 'left', 'monday', original.power, async () => { sent.push('on'); });
  schedulePowerOffAndSleepAnalysis(settings, 'left', 'monday', original.power, async () => { sent.push('off'); });
  scheduleTemperatures(settings, 'left', 'monday', original, async () => { sent.push('temperature'); });
  scheduleAlarm(settings, 'left', 'monday', original, async alarm => { sent.push(`alarm:${alarm.duration}`); });
  const jobs = scheduler.default.scheduledJobs;
  context.after(() => { Object.values(jobs).forEach(job => job.cancel()); });
  const names = ['left-monday-22:00-power-on', 'left-monday-08:00-power-off',
    'left-monday-23:00-78-temperature-adjustment', 'left-monday-07:00-alarm'];
  const invoke = async () => { sent.length = 0; for (const name of names) { assert.ok(jobs[name]); await jobs[name].invoke(); } };
  await invoke(); assert.deepEqual(sent, ['on', 'off', 'temperature', 'alarm:60']);
  for (const reason of ['disabled', 'away', 'timezone', 'start-edited']) {
    const book = structuredClone(schedules); const preferences = structuredClone(settings);
    if (reason === 'disabled') book.left.monday.power.enabled = false;
    if (reason === 'away') preferences.left.awayMode = true;
    if (reason === 'timezone') preferences.timeZone = 'America/Los_Angeles';
    if (reason === 'start-edited') book.left.monday.power.on = '21:30';
    await persist(book, preferences); await invoke(); assert.deepEqual(sent, [], reason);
  }
  const edited = structuredClone(schedules); edited.left.monday.temperatures = {}; edited.left.monday.alarm.enabled = false;
  await persist(edited); await invoke(); assert.deepEqual(sent, ['on', 'off']);
  edited.left.monday.alarm.enabled = true; edited.left.monday.alarm.duration = 120;
  await persist(edited); sent.length = 0; await jobs['left-monday-07:00-alarm'].invoke();
  assert.deepEqual(sent, ['alarm:120']);
});
