import { useEffect, useState } from 'react';
import { Alert, Button, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '@api/api';
import { errorMessage } from '@api/platform';
import { PreferenceChangeSchema, type PodPreferences } from '../../../../server/src/preferences/contract';
import PageContainer from '../PageContainer';
import PageHeader from '@components/PageHeader';
import FormField from '@components/FormField';
import Surface from './Surface';

type Snapshot = { podID: string; timeZones: string[]; preferences: PodPreferences };
export default function DevicePreferencesPage() {
  const cache = useQueryClient();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [draft, setDraft] = useState<PodPreferences>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [message, setMessage] = useState<string>();
  const load = async (signal?: AbortSignal) => {
    setBusy(true); setFailure(undefined); setMessage(undefined);
    try {
      const { data } = await api.get<Snapshot>('/settings/preferences', { signal });
      if (!signal?.aborted) { setSnapshot(data); setDraft(structuredClone(data.preferences)); }
    } catch (error) { if (!signal?.aborted) setFailure(errorMessage(error)); }
    finally { if (!signal?.aborted) setBusy(false); }
  };
  useEffect(() => { const request = new AbortController(); void load(request.signal); return () => request.abort(); }, []);
  const change = snapshot && draft ? PreferenceChangeSchema.safeParse({
    podID: snapshot.podID, expected: snapshot.preferences, preferences: draft,
  }) : undefined;
  const dirty = JSON.stringify(snapshot?.preferences) !== JSON.stringify(draft);
  const save = async () => {
    if (busy || !change?.success) return;
    setBusy(true); setFailure(undefined); setMessage(undefined);
    try {
      const { data } = await api.post<Snapshot>('/settings/preferences', change.data);
      setSnapshot(data); setDraft(structuredClone(data.preferences)); setMessage('Device settings saved.');
      await Promise.all(['useSettings', 'alarm', 'analytics', 'journal'].map(key => cache.invalidateQueries({ queryKey: [key] })));
    } catch (error) { setFailure(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <PageContainer sx={ { maxWidth: 800 } }>
    <Button component={ Link } to="/settings" sx={ { alignSelf: 'flex-start' } }>Back to Settings</Button>
    <PageHeader title="Device settings" />
    <Typography color="text.secondary">Changes apply to this Pod in both apps. Review your edits, then save.</Typography>
    { failure && <Alert severity="error">{ failure }</Alert> }
    { message && <Typography role="status" color="success.main">{ message }</Typography> }
    { draft && snapshot && <>
      <Surface title="Time & temperature" eyebrow="YOUR POD">
        <Stack spacing={ 2 }>
          <FormField title="Time zone"><TextField
            select
            value={ draft.timeZone }
            disabled={ busy }
            slotProps={ { select: { inputProps: { 'aria-label': 'Time zone' } } } }
            onChange={ event => setDraft({ ...draft, timeZone: event.target.value as PodPreferences['timeZone'] }) }>
            { snapshot.timeZones.map(zone => <MenuItem key={ zone } value={ zone }>{ zone }</MenuItem>) }
          </TextField></FormField>
          <Typography variant="caption" color="text.secondary">
        Changing the timezone shifts when local routines, alarms and daily tasks run.
          </Typography>
          <FormField title="Temperature format"><TextField
            select
            value={ draft.temperatureFormat }
            disabled={ busy }
            slotProps={ { select: { inputProps: { 'aria-label': 'Temperature format' } } } }
            onChange={ event => setDraft({ ...draft, temperatureFormat: event.target.value as PodPreferences['temperatureFormat'] }) }>
            <MenuItem value="fahrenheit">Fahrenheit · °F</MenuItem><MenuItem value="celsius">Celsius · °C</MenuItem>
          </TextField></FormField>
        </Stack>
      </Surface>
      <Surface title="Side settings" eyebrow="EACH SIDE, YOUR WAY">
        <Stack spacing={ 2.5 }>
          { (['left', 'right'] as const).map(side => <Stack key={ side } spacing={ 1 }>
            <FormField title={ `${side === 'left' ? 'Left' : 'Right'} side name` }><TextField
              value={ draft[side].name }
              disabled={ busy }
              slotProps={ { htmlInput: { maxLength: 20, 'aria-label': `${side === 'left' ? 'Left' : 'Right'} side name` } } }
              onChange={ event => setDraft({ ...draft, [side]: { ...draft[side], name: event.target.value } }) } /></FormField>
            <FormControlLabel
              label={ `${side === 'left' ? 'Left' : 'Right'} Away mode` }
              control={ <Switch
                checked={ draft[side].awayMode }
                disabled={ busy }
                onChange={ (_, enabled) => setDraft({ ...draft, [side]: { ...draft[side], awayMode: enabled } }) } /> } />
          </Stack>) }
          <Typography variant="caption" color="text.secondary">
        Away mode pauses this side’s routines and temperature controls. It follows the active side. When both sides are away, routines pause.
          </Typography>
        </Stack>
      </Surface>
      <Surface title="Daily care" eyebrow="READY FOR TONIGHT">
        <Stack spacing={ 2 }>
          <FormControlLabel
            label="Prime daily"
            control={ <Switch
              checked={ draft.primePodDaily.enabled }
              disabled={ busy }
              onChange={ (_, enabled) => setDraft({ ...draft, primePodDaily: { ...draft.primePodDaily, enabled } }) } /> } />
          <FormField title="Daily time"><TextField
            type="time"
            value={ draft.primePodDaily.time }
            disabled={ busy }
            slotProps={ { htmlInput: { 'aria-label': 'Daily time' } } }
            onChange={ event => setDraft({ ...draft, primePodDaily: { ...draft.primePodDaily, time: event.target.value } }) } /></FormField>
          <Typography variant="caption" color="text.secondary">Uses the Pod timezone. Choose a time when the bed is empty.</Typography>
          <FormControlLabel
            label="Reboot once a day"
            control={ <Switch
              checked={ draft.rebootDaily }
              disabled={ busy }
              onChange={ (_, rebootDaily) => setDraft({ ...draft, rebootDaily }) } /> } />
          <Typography variant="caption" color="text.secondary">
        Daily reboot runs one hour before priming. Daily priming must also be on.
          </Typography>
        </Stack>
      </Surface>
      <Stack direction="row" spacing={ 1 } useFlexGap sx={ { flexWrap: 'wrap' } }>
        <Button variant="contained" disabled={ busy || !dirty || !change?.success } onClick={ save }>
          { busy ? 'Saving…' : 'Save device settings' }
        </Button>
        <Button
          variant="outlined"
          disabled={ busy || !dirty }
          onClick={ () => { setDraft(structuredClone(snapshot.preferences)); setMessage(undefined); } }>
          Reset draft
        </Button>
      </Stack>
      { !change?.success && <Typography color="error">Use names of 1–20 characters and a valid daily time.</Typography> }
    </> }
    <Button variant="outlined" disabled={ busy } onClick={ () => load() }>{ busy && !draft ? 'Loading…' : 'Reload saved settings' }</Button>
    <Button component={ Link } to="/settings/advanced">Advanced device controls</Button>
  </PageContainer>;
}
