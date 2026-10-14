import { useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import moment from 'moment-timezone';
import axios, { baseURL } from '@api/api';
import { errorMessage } from '@api/platform';
import { useSettings } from '@api/settings';
import type { journalResponse } from '../../../../server/src/analytics/journalRouter';
import FormField from '@components/FormField';
import Surface from './Surface';
import JournalForm from './JournalForm';

export type Journal = ReturnType<typeof journalResponse>;
export default function JournalCard({ side, days }: { side: 'left' | 'right'; days: number }) {
  const settings = useSettings();
  const timeZone = settings.data?.timeZone || 'UTC';
  const [selectedDate, setSelectedDate] = useState<string>();
  const date = selectedDate ?? moment.tz(timeZone).format('YYYY-MM-DD');
  const validDate = moment(date, 'YYYY-MM-DD', true).isValid();
  const queryKey = ['journal', baseURL, side, days, date];
  const query = useQuery({ queryKey, enabled: validDate,
    queryFn: async ({ signal }) => (await axios.get<Journal>('journal', { params: { side, days, date }, signal })).data });
  return <Surface title="How did the night feel?" eyebrow="YOUR MORNING CHECK-IN">
    <Stack spacing={ 2 }>
      <FormField title="Wake date">
        <TextField
          type="date"
          value={ date }
          onChange={ event => setSelectedDate(event.target.value) }
          slotProps={ { htmlInput: { 'aria-label': 'Wake date' } } } />
      </FormField>
      <Typography variant="caption" color="text.secondary">Wake date in { timeZone } · { side } side</Typography>
      { !validDate && <Alert severity="info">Choose a valid wake date.</Alert> }
      { query.isPending && validDate && <Typography>Loading check-in…</Typography> }
      { query.isError && <Alert severity="error" action={ <Button onClick={ () => query.refetch() }>Retry</Button> }>
        { errorMessage(query.error) }
      </Alert> }
      { query.data && (query.data.selectedDate === date
        ? <JournalForm
          key={ `${baseURL}:${side}:${date}` }
          side={ side }
          date={ date }
          entry={ query.data.selected ?? undefined }
          queryKey={ queryKey } />
        : <Alert severity="error">Update your Free Sleep server to load check-ins by wake date before editing.</Alert>) }
      <Typography color="text.secondary" variant="caption">
        Saved notes stay on your Pod. Coaching receives numerical patterns and your submitted question only when you allow sharing.
      </Typography>
      { query.data?.patterns.associations.map(pattern => <Typography key={ pattern.habit } variant="body2">
        { pattern.habit }: { pattern.presenceDifferenceMinutes > 0 ? '+' : '' }{ pattern.presenceDifferenceMinutes } minutes
        of bed presence on recorded nights with this habit ({ pattern.withCount } with / { pattern.withoutCount } without).
      </Typography>) }
      <Typography color="text.secondary" variant="caption">{ query.data?.patterns.note }</Typography>
    </Stack>
  </Surface>;
}
