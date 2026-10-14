import { useState } from 'react';
import { Alert, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import moment from 'moment-timezone';
import axios from '@api/api';
import { errorMessage } from '@api/platform';
import { useSettings } from '@api/settings';
import type { JournalEntry } from '../../../../server/src/analytics/journal';
import type { journalPatterns } from '../../../../server/src/analytics/journal';
import Surface from './Surface';
import JournalForm from './JournalForm';

type Journal = { entries: JournalEntry[]; patterns: ReturnType<typeof journalPatterns> };
export default function JournalCard({ side, days }: { side: 'left' | 'right'; days: number }) {
  const settings = useSettings();
  const [date, setDate] = useState(() => moment.tz(settings.data?.timeZone || 'UTC').format('YYYY-MM-DD'));
  const query = useQuery({ queryKey: ['journal', side, days],
    queryFn: async () => (await axios.get<Journal>('journal', { params: { side, days } })).data });
  return <Surface title="How did the night feel?" eyebrow="YOUR MORNING CHECK-IN">
    <Stack spacing={ 2 }>
      <TextField
        type="date"
        label="Wake date"
        value={ date }
        onChange={ event => setDate(event.target.value) }
        slotProps={ { inputLabel: { shrink: true } } } />
      { query.isError && <Alert severity="error">{ errorMessage(query.error) }</Alert> }
      { query.data && <JournalForm
        key={ `${side}:${date}` }
        side={ side }
        date={ date }
        entry={ query.data.entries.find(entry => entry.date === date) } /> }
      <Typography color="text.secondary" variant="caption">
        Your notes stay on your Pod. AI receives only numerical patterns when you choose to share a summary.
      </Typography>
      { query.data?.patterns.associations.map(pattern => <Typography key={ pattern.habit } variant="body2">
        { pattern.habit }: { pattern.presenceDifferenceMinutes > 0 ? '+' : '' }{ pattern.presenceDifferenceMinutes } minutes
        of bed presence on recorded nights with this habit ({ pattern.withCount } with / { pattern.withoutCount } without).
      </Typography>) }
      <Typography color="text.secondary" variant="caption">{ query.data?.patterns.note }</Typography>
    </Stack>
  </Surface>;
}
