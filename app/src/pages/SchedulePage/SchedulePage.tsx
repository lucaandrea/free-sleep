import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { baseURL } from '@api/api';
import { useSchedules, saveRoutine } from '@api/schedules';
import { useSettings } from '@api/settings';
import { errorMessage } from '@api/platform';
import { postAlarm } from '@api/alarm';
import type { DailySchedule, DayOfWeek } from '@api/schedulesSchema';
import { useAppStore } from '@state/appStore';
import SideControl from '@components/SideControl';
import PageHeader from '@components/PageHeader';
import PageContainer from '../PageContainer';
import Surface from '../Platform/Surface';
import { design } from '../../design/tokens';
import { ROUTINE_DAYS, routineProblems, routinesEqual } from '../../../../server/src/routines/contract';
import { useRoutineDrafts } from './routineDrafts';
import RoutineTimeline from './RoutineTimeline';
import { RoutineAdjustmentFields, RoutineAlarmFields, RoutinePowerFields } from './RoutineFields';

const title = (day: string) => day.charAt(0).toUpperCase() + day.slice(1);
export default function SchedulePage() {
  const { side } = useAppStore();
  const schedules = useSchedules();
  const settings = useSettings();
  const queries = useQueryClient();
  const workspace = useRoutineDrafts();
  const [busy, setBusy] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [status, setStatus] = useState({ key: '', text: '', error: false });
  const [dialog, setDialog] = useState<{ key: string; action: 'reload' | 'test' } | null>(null);
  const prefix = `${baseURL}|${settings.data?.id ?? ''}|${side}|`;
  const key = `${prefix}${workspace.day}`;
  const original = schedules.data?.[side][workspace.day];
  const draft = workspace.drafts[key];
  const selected = draft?.value ?? original;
  const copies = draft?.copies ?? [];
  const changed = !!draft && (!routinesEqual(draft.original, draft.value) || copies.length > 0);
  const problems = selected ? routineProblems(selected) : [];
  const celsius = settings.data?.temperatureFormat === 'celsius';
  const mutate = (value: DailySchedule, copyDays = copies) => {
    if (!original) return;
    workspace.put(key, { original: draft?.original ?? structuredClone(original), value, copies: copyDays });
    setStatus({ key, text: '', error: false });
  };
  const save = async () => {
    if (!selected || !original || !schedules.data) return;
    const days = [workspace.day, ...copies];
    const occupied = copies.find((day) => workspace.drafts[`${prefix}${day}`]);
    if (occupied) {
      setStatus({ key, text: `Save or reset ${title(occupied)}'s draft before copying to it.`, error: true });
      return;
    }
    setBusy(true);
    try {
      const expected = Object.fromEntries(
        days.map((day) => [day, day === workspace.day ? (draft?.original ?? original) : schedules.data![side][day]]),
      );
      const result = await saveRoutine({ side, days, schedule: selected, expected });
      queries.setQueryData(['useSchedules'], result);
      workspace.clear(days.map((day) => `${prefix}${day}`));
      void queries.invalidateQueries({ queryKey: ['alarm', side] });
      setStatus({ key, text: `Saved ${days.map(title).join(', ')} for the ${side} side.`, error: false });
    } catch (error) {
      setStatus({ key, text: errorMessage(error), error: true });
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (dialog?.key !== key || !selected) return;
    const action = dialog.action;
    setBusy(true);
    try {
      if (action === 'reload') {
        const result = await schedules.refetch();
        if (result.error) throw result.error;
        workspace.clear([key]);
        setReloadVersion(version => version + 1);
        setStatus({ key, text: 'Saved routine reloaded.', error: false });
      } else {
        await postAlarm({
          side,
          duration: 10,
          vibrationIntensity: selected.alarm.vibrationIntensity,
          vibrationPattern: selected.alarm.vibrationPattern,
          force: true,
        });
        setStatus({ key, text: 'Vibration test command sent for 10 seconds.', error: false });
      }
      setDialog(null);
    } catch (error) {
      setStatus({ key, text: errorMessage(error), error: true });
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageContainer sx={ { maxWidth: design.layout.narrowPageWidth } }>
      <PageHeader title="Set your rhythm." />
      <Typography color="text.secondary" sx={ { mt: -1.5 } }>
        A comfortable night, right on time.
      </Typography>
      <SideControl disabled={ busy } />
      <ToggleButtonGroup
        exclusive
        value={ workspace.day }
        disabled={ busy }
        aria-label="Routine day"
        onChange={ (_, day: DayOfWeek | null) => {
          if (day) workspace.select(day);
        } }
        sx={ { overflowX: 'auto', '& .MuiToggleButton-root': { flex: 1, minWidth: 44, px: 0.5 } } }
      >
        { ROUTINE_DAYS.map((day) => (
          <ToggleButton key={ day } value={ day } aria-label={ title(day) }>
            { title(day).slice(0, 3) }
            { workspace.drafts[`${prefix}${day}`] ? ' ·' : '' }
          </ToggleButton>
        )) }
      </ToggleButtonGroup>
      { schedules.isError || settings.isError ? (
        <Alert
          severity="error"
          action={
            <Button
              onClick={ () => {
                void schedules.refetch();
                void settings.refetch();
              } }
            >
              Retry
            </Button>
          }
        >
          Unable to load routines. Your drafts are still here.
        </Alert>
      ) : !selected || !settings.data ? (
        <Typography>Loading routines…</Typography>
      ) : (
        <>
          <Surface
            title={ `${title(workspace.day)} night` }
            eyebrow={ `POD LOCAL TIME · ${settings.data.timeZone}` }
            action={ <Chip size="small" label={ changed ? 'Unsaved' : selected.power.enabled ? 'Enabled' : 'Off' } /> }
          >
            <RoutineTimeline schedule={ selected } celsius={ celsius } />
          </Surface>
          { settings.data[side].awayMode && (
            <Alert severity="info">Away mode is on. This side's routines are paused.</Alert>
          ) }
          <Box
            component="fieldset"
            disabled={ busy }
            sx={ { m: 0, p: 0, border: 0, minWidth: 0, display: 'grid', gap: 2.5 } }
          >
            <RoutinePowerFields schedule={ selected } change={ mutate } celsius={ celsius } />
            <RoutineAdjustmentFields key={ `${key}|${reloadVersion}` } schedule={ selected } change={ mutate } celsius={ celsius } />
            <RoutineAlarmFields
              schedule={ selected }
              change={ mutate }
              celsius={ celsius }
              onTest={ () => setDialog({ key, action: 'test' }) }
            />
            <Surface title="Make it a rhythm" eyebrow="COPY TO OTHER DAYS">
              <Stack spacing={ 2 }>
                <Typography variant="body2" color="text.secondary">
                  Copies include power, temperature and alarm settings for this side.
                </Typography>
                <Box sx={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 } }>
                  { [
                    ['Weekdays', ROUTINE_DAYS.slice(0, 5)],
                    ['Weekends', ROUTINE_DAYS.slice(5)],
                    ['Every day', ROUTINE_DAYS],
                    ['Clear', []],
                  ].map(([label, days]) => (
                    <Button
                      key={ label as string }
                      variant="outlined"
                      onClick={ () =>
                        mutate(
                          selected,
                          (days as DayOfWeek[]).filter((day) => day !== workspace.day),
                        )
                      }
                    >
                      { label as string }
                    </Button>
                  )) }
                </Box>
                <Box sx={ { display: 'grid', gridTemplateColumns: '1fr 1fr' } }>
                  { ROUTINE_DAYS.map((day) => (
                    <FormControlLabel
                      key={ day }
                      label={ title(day) }
                      control={
                        <Checkbox
                          checked={ day === workspace.day || copies.includes(day) }
                          disabled={ day === workspace.day }
                          onChange={ (_, checked) =>
                            mutate(selected, checked ? [...copies, day] : copies.filter((item) => item !== day))
                          }
                        />
                      }
                    />
                  )) }
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Saving replaces the full routine on: { [workspace.day, ...copies].map(title).join(', ') }.
                </Typography>
              </Stack>
            </Surface>
          </Box>
          { problems.length > 0 && (
            <Alert severity="error">
              { problems.map((problem) => (
                <Typography key={ problem } variant="body2">
                  { problem }
                </Typography>
              )) }
            </Alert>
          ) }
          { status.key === key && status.text && (
            <Alert severity={ status.error ? 'error' : 'success' }>{ status.text }</Alert>
          ) }
          <Stack direction="row" useFlexGap sx={ { gap: 1, flexWrap: 'wrap' } }>
            <Button variant="contained" disabled={ busy || !changed || problems.length > 0 } onClick={ save }>
              { busy ? 'Saving…' : copies.length ? `Save ${copies.length + 1} days` : 'Save routine' }
            </Button>
            <Button variant="outlined" disabled={ busy } onClick={ () => setDialog({ key, action: 'reload' }) }>
              Reload saved
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Drafts stay per side and day while this app is open. Changes take effect only after saving.
          </Typography>
        </>
      ) }
      <Dialog open={ dialog?.key === key } onClose={ busy ? undefined : () => setDialog(null) }>
        <DialogTitle>{ dialog?.action === 'test' ? 'Test vibration?' : 'Reload saved routine?' }</DialogTitle>
        <DialogContent>
          { dialog?.action === 'test'
            ? `Vibrate the ${side} side for 10 seconds now, including when the routine is off. Requires a local Pod connection.`
            : `Discard ${title(workspace.day)}'s draft and copy selections, then load the saved routine.` }
        </DialogContent>
        <DialogActions>
          <Button disabled={ busy } onClick={ () => setDialog(null) }>
            Cancel
          </Button>
          <Button disabled={ busy } onClick={ confirm }>
            { dialog?.action === 'test' ? 'Test now' : 'Reload saved' }
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
}
