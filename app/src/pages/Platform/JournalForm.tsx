import { Alert, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import axios, { baseURL } from '@api/api';
import { errorMessage } from '@api/platform';
import type { JournalEntry } from '../../../../server/src/analytics/journal';
import FormField from '@components/FormField';
import { useJournalDrafts } from './journalDrafts';
import type { Journal } from './JournalCard';

export default function JournalForm({ entry, side, date, queryKey }: {
  entry?: JournalEntry; side: 'left' | 'right'; date: string; queryKey: QueryKey;
}) {
  const key = `${baseURL}|${side}|${date}`;
  const workspace = useJournalDrafts();
  const saving = workspace.saving[key] ?? false;
  const draft = workspace.drafts[key] ?? entry ?? {
    side, date, restfulness: 3, comfort: 'comfortable', caffeine: false, alcohol: false, exercise: false, notes: '',
  };
  const queries = useQueryClient();
  const save = useMutation({ mutationFn: async (value: JournalEntry) => (await axios.post<JournalEntry>('journal', value)).data,
    onSuccess: (saved, posted) => {
      queries.setQueryData<Journal>(queryKey, previous => previous ? { ...previous, selected: saved } : previous);
      workspace.clear(key, posted);
      return queries.invalidateQueries({ queryKey: ['journal', baseURL, side] });
    }, onSettled: () => workspace.finishSave(key) });
  const change = (value: JournalEntry) => { workspace.put(key, value); save.reset(); };
  return <Stack spacing={ 2 }>
    <FormField title="Restfulness">
      <TextField
        select
        value={ draft.restfulness }
        disabled={ saving }
        slotProps={ { select: { inputProps: { 'aria-label': 'Restfulness' } } } }
        onChange={ event => change({ ...draft, restfulness: Number(event.target.value) }) }>
        { ['Very low', 'Low', 'Okay', 'Good', 'Great'].map((label, index) => <MenuItem key={ label } value={ index + 1 }>{ label }</MenuItem>) }
      </TextField>
    </FormField>
    <FormField title="Temperature comfort">
      <TextField
        select
        value={ draft.comfort }
        disabled={ saving }
        slotProps={ { select: { inputProps: { 'aria-label': 'Temperature comfort' } } } }
        onChange={ event => change({ ...draft, comfort: event.target.value as JournalEntry['comfort'] }) }>
        <MenuItem value="cold">Too cold</MenuItem><MenuItem value="comfortable">Comfortable</MenuItem><MenuItem value="warm">Too warm</MenuItem>
      </TextField>
    </FormField>
    <Stack>
      { (['caffeine', 'alcohol', 'exercise'] as const).map(habit => <FormControlLabel
        key={ habit }
        label={ habit[0].toUpperCase() + habit.slice(1) }
        control={ <Checkbox
          disabled={ saving }
          checked={ draft[habit] }
          onChange={ (_, checked) => change({ ...draft, [habit]: checked }) } /> } />) }
    </Stack>
    <FormField title="Notes for yourself">
      <TextField
        multiline
        minRows={ 3 }
        value={ draft.notes }
        disabled={ saving }
        slotProps={ { htmlInput: { maxLength: 500, 'aria-label': 'Notes for yourself' } } }
        onChange={ event => change({ ...draft, notes: event.target.value }) } />
    </FormField>
    <Button variant="contained" disabled={ saving } onClick={ () => { if (workspace.beginSave(key)) save.mutate(draft); } }>
      { saving ? 'Saving…' : 'Save check-in' }
    </Button>
    <Button
      variant="outlined"
      disabled={ saving || !workspace.drafts[key] }
      onClick={ () => { workspace.clear(key); save.reset(); } }>Reset draft</Button>
    { save.isSuccess && <Typography role="status" variant="caption" color="success.main">Check-in saved.</Typography> }
    { save.isError && <Alert severity="error">{ errorMessage(save.error) }</Alert> }
    <Typography variant="caption" color="text.secondary">Unsaved notes stay per Pod, side and wake date while this app is open.</Typography>
  </Stack>;
}
