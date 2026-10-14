import { useState } from 'react';
import { Alert, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from '@api/api';
import { errorMessage } from '@api/platform';
import type { JournalEntry } from '../../../../server/src/analytics/journal';

export default function JournalForm({ entry, side, date }: { entry?: JournalEntry; side: 'left' | 'right'; date: string }) {
  const [draft, setDraft] = useState<JournalEntry>(entry || {
    side, date, restfulness: 3, comfort: 'comfortable', caffeine: false, alcohol: false, exercise: false, notes: '',
  });
  const queries = useQueryClient();
  const save = useMutation({ mutationFn: () => axios.post('journal', draft),
    onSuccess: () => queries.invalidateQueries({ queryKey: ['journal', side] }) });
  return <Stack spacing={ 2 }>
    <Stack direction={ { xs: 'column', sm: 'row' } } spacing={ 2 }>
      <TextField
        fullWidth
        select
        label="Restfulness"
        value={ draft.restfulness }
        onChange={ event => setDraft({ ...draft, restfulness: Number(event.target.value) }) }>
        { ['Very low', 'Low', 'Okay', 'Good', 'Great'].map((label, index) =>
          <MenuItem key={ label } value={ index + 1 }>{ label }</MenuItem>) }
      </TextField>
      <TextField
        fullWidth
        select
        label="Temperature comfort"
        value={ draft.comfort }
        onChange={ event => setDraft({ ...draft, comfort: event.target.value as JournalEntry['comfort'] }) }>
        <MenuItem value="cold">Too cold</MenuItem><MenuItem value="comfortable">Comfortable</MenuItem><MenuItem value="warm">Too warm</MenuItem>
      </TextField>
    </Stack>
    <Stack direction="row" sx={ { flexWrap: 'wrap' } }>
      { (['caffeine', 'alcohol', 'exercise'] as const).map(habit =>
        <FormControlLabel
          key={ habit }
          label={ habit[0].toUpperCase() + habit.slice(1) }
          control={
            <Checkbox checked={ draft[habit] } onChange={ (_, checked) => setDraft({ ...draft, [habit]: checked }) } />
          } />) }
    </Stack>
    <TextField
      multiline
      minRows={ 2 }
      label="Notes for yourself"
      value={ draft.notes }
      slotProps={ { htmlInput: { maxLength: 500 } } }
      onChange={ event => setDraft({ ...draft, notes: event.target.value }) } />
    <Button variant="contained" disabled={ save.isPending || !date } onClick={ () => save.mutate() }>Save check-in</Button>
    { save.isSuccess && <Typography variant="caption" color="success.main">Check-in saved.</Typography> }
    { save.isError && <Alert severity="error">{ errorMessage(save.error) }</Alert> }
  </Stack>;
}
