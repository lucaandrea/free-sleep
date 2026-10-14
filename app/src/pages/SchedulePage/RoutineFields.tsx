/* eslint-disable react/no-multi-comp */
import { useId, useState, type ReactNode } from 'react';
import { Alert, Box, Button, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import type { DailySchedule } from '@api/schedulesSchema';
import { TimeSchema } from '@api/schedulesSchema';
import { formatTemperature } from '@lib/temperatureConversions';
import { minutesAfter } from '../../../../server/src/routines/contract';
import Surface from '../Platform/Surface';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

function RoutineField({ label, children }: { label: string; children: (labelId: string) => ReactNode }) {
  const labelId = useId();
  return <Stack spacing={ 1 }>
    <Typography id={ labelId } variant="body2" color="text.secondary">{ label }</Typography>
    { children(labelId) }
  </Stack>;
}
export function RoutineTimeField({ label, value, change }: {
  label: string; value: string; change: (value: string) => void;
}) {
  return <RoutineField label={ label }>{ labelId =>
    <TextField
      type="time"
      value={ value }
      onChange={ event => change(event.target.value) }
      fullWidth
      slotProps={ { htmlInput: { 'aria-labelledby': labelId } } } />
  }</RoutineField>;
}
export function RoutineTemperatureField({ label, value, change, celsius }: {
  label: string; value: number; change: (value: number) => void; celsius: boolean;
}) {
  return <RoutineField label={ label }>{ labelId =>
    <TextField
      select
      value={ value }
      fullWidth
      onChange={ event => change(Number(event.target.value)) }
      slotProps={ { select: { labelId } } }>
      { Array.from({ length: 56 }, (_, index) => index + 55).map(temperature =>
        <MenuItem key={ temperature } value={ temperature }>{ formatTemperature(temperature, celsius) }</MenuItem>) }
    </TextField>
  }</RoutineField>;
}
function RoutineNumberField({ label, value, change, maximum }: {
  label: string; value: number; change: (value: number) => void; maximum: number;
}) {
  return <RoutineField label={ label }>{ labelId =>
    <Box sx={ { display: 'flex', alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: '8px' } }>
      <IconButton
        aria-label={ `Decrease ${label}` }
        disabled={ value <= 1 }
        onClick={ () => change(Math.max(1, value - 1)) }
        sx={ { width: 44, height: 44 } }><RemoveIcon fontSize="small" /></IconButton>
      <TextField
        type="number"
        value={ value }
        onChange={ event => change(Number(event.target.value)) }
        slotProps={ { htmlInput: { 'aria-labelledby': labelId, min: 1, max: maximum, step: 1 } } }
        sx={ { flex: 1, '& fieldset': { border: 0 }, '& input': { textAlign: 'center', MozAppearance: 'textfield' },
          '& input::-webkit-inner-spin-button, & input::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 } } } />
      <IconButton
        aria-label={ `Increase ${label}` }
        disabled={ value >= maximum }
        onClick={ () => change(Math.min(maximum, value + 1)) }
        sx={ { width: 44, height: 44 } }>
        <AddIcon fontSize="small" />
      </IconButton>
    </Box>
  }</RoutineField>;
}
export interface RoutineFieldProps {
  schedule: DailySchedule;
  change: (schedule: DailySchedule) => void;
  celsius: boolean;
}
export function RoutinePowerFields({ schedule, change, celsius }: RoutineFieldProps) {
  const setPower = (partial: Partial<DailySchedule['power']>) =>
    change({ ...schedule, power: { ...schedule.power, ...partial } });
  return (
    <Surface title="Your nightly routine" eyebrow="POWER & TEMPERATURE">
      <Stack spacing={ 2.5 }>
        <FormControlLabel
          control={ <Switch checked={ schedule.power.enabled } onChange={ (_, enabled) => setPower({ enabled }) } /> }
          label="Enable routine"
          labelPlacement="start"
          sx={ { m: 0, justifyContent: 'space-between' } }
        />
        <Box sx={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 } }>
          <RoutineTimeField label="Turn on" value={ schedule.power.on } change={ (on) => setPower({ on }) } />
          <RoutineTimeField label="Turn off" value={ schedule.power.off } change={ (off) => setPower({ off }) } />
        </Box>
        <RoutineTemperatureField
          label="Starting temperature"
          value={ schedule.power.onTemperature }
          celsius={ celsius }
          change={ (onTemperature) => setPower({ onTemperature }) }
        />
        <Typography variant="caption" color="text.secondary">
          The selected day is the day your routine starts. Earlier clock times belong to the following day.
        </Typography>
      </Stack>
    </Surface>
  );
}
export function RoutineAdjustmentFields({ schedule, change, celsius }: RoutineFieldProps) {
  const [time, setTime] = useState('01:00');
  const [temperature, setTemperature] = useState(78);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const save = () => {
    const offset = minutesAfter(time, schedule.power.on);
    if (
      !TimeSchema.safeParse(time).success ||
      !(offset > 0 && offset < minutesAfter(schedule.power.off, schedule.power.on))
    ) {
      setMessage('Choose a time between turn-on and turn-off.');
      return;
    }
    if (time !== editing && Object.prototype.hasOwnProperty.call(schedule.temperatures, time)) {
      setMessage('An adjustment already uses this time. Edit that adjustment instead.');
      return;
    }
    const temperatures = { ...schedule.temperatures };
    if (editing) delete temperatures[editing];
    temperatures[time] = temperature;
    change({ ...schedule, temperatures });
    setEditing(null);
    setMessage('');
  };
  return (
    <Surface title="Through the night" eyebrow="TEMPERATURE ADJUSTMENTS">
      <Stack spacing={ 2.5 }>
        { Object.entries(schedule.temperatures)
          .sort(([first], [second]) => minutesAfter(first, schedule.power.on) - minutesAfter(second, schedule.power.on))
          .map(([clock, value]) => (
            <Stack key={ clock } direction="row" sx={ { alignItems: 'center', gap: 1 } }>
              <Typography sx={ { flex: 1 } }>
                { clock } · { formatTemperature(value, celsius) }
              </Typography>
              <Button
                aria-label={ `Edit adjustment ${clock}` }
                onClick={ () => {
                  setEditing(clock);
                  setTime(clock);
                  setTemperature(value);
                  setMessage('');
                } }
              >
                Edit
              </Button>
              <Button
                color="error"
                aria-label={ `Remove adjustment ${clock}` }
                onClick={ () => {
                  const temperatures = { ...schedule.temperatures };
                  delete temperatures[clock];
                  change({ ...schedule, temperatures });
                  if (editing === clock) setEditing(null);
                } }
              >
                Remove
              </Button>
            </Stack>
          )) }
        { !Object.keys(schedule.temperatures).length && (
          <Typography color="text.secondary">Your starting temperature stays the same until turn-off.</Typography>
        ) }
        <RoutineTimeField label="Adjustment time" value={ time } change={ setTime } />
        <RoutineTemperatureField
          label="Target temperature"
          value={ temperature }
          celsius={ celsius }
          change={ setTemperature }
        />
        <Stack direction="row" sx={ { gap: 1 } }>
          <Button variant="outlined" onClick={ save }>
            { editing ? 'Update adjustment' : 'Add adjustment' }
          </Button>
          { editing && (
            <Button
              onClick={ () => {
                setEditing(null);
                setMessage('');
              } }
            >
              Cancel edit
            </Button>
          ) }
        </Stack>
        { message && <Alert severity="error">{ message }</Alert> }
      </Stack>
    </Surface>
  );
}
export function RoutineAlarmFields({ schedule, change, onTest }: RoutineFieldProps & { onTest: () => void }) {
  const setAlarm = (partial: Partial<DailySchedule['alarm']>) =>
    change({ ...schedule, alarm: { ...schedule.alarm, ...partial } });
  return (
    <Surface title="Ease into the morning" eyebrow="VIBRATION ALARM">
      <Stack spacing={ 2.5 }>
        <FormControlLabel
          control={ <Switch checked={ schedule.alarm.enabled } onChange={ (_, enabled) => setAlarm({ enabled }) } /> }
          label="Vibration alarm"
          labelPlacement="start"
          sx={ { m: 0, justifyContent: 'space-between' } }
        />
        { schedule.alarm.enabled && (
          <>
            <RoutineTimeField label="Wake time" value={ schedule.alarm.time } change={ (time) => setAlarm({ time }) } />
            <RoutineField label="Pattern">{ labelId =>
              <TextField
                select
                value={ schedule.alarm.vibrationPattern }
                slotProps={ { select: { labelId } } }
                onChange={ event => setAlarm({ vibrationPattern: event.target.value as 'rise' | 'double' }) }>
                <MenuItem value="rise">Rise</MenuItem><MenuItem value="double">Double</MenuItem>
              </TextField>
            }</RoutineField>
            <RoutineNumberField
              label="Intensity (%)"
              value={ schedule.alarm.vibrationIntensity }
              maximum={ 100 }
              change={ vibrationIntensity => setAlarm({ vibrationIntensity }) } />
            <RoutineNumberField
              label="Duration (seconds)"
              value={ schedule.alarm.duration }
              maximum={ 180 }
              change={ duration => setAlarm({ duration }) } />
            <Typography variant="caption" color="text.secondary">
              Vibration runs for at least 10 seconds and needs this side to be on. Add a temperature adjustment to warm
              before waking.
            </Typography>
            <Button variant="outlined" onClick={ onTest }>
              Test vibration
            </Button>
          </>
        ) }
      </Stack>
    </Surface>
  );
}
