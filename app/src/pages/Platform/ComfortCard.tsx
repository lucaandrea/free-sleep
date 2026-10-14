import { useState } from 'react';
import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from '@api/api';
import { errorMessage } from '@api/platform';
import { useSettings } from '@api/settings';
import type { ComfortConfig, ComfortStatus } from '../../../../server/src/thermal/types';
import Surface from './Surface';

export default function ComfortCard({ side }: { side: 'left' | 'right' }) {
  const queries = useQueryClient();
  const { data: preferences } = useSettings();
  const [draft, setDraft] = useState<ComfortConfig | null>(null);
  const [expanded, setExpanded] = useState(false);
  const state = useQuery({ queryKey: ['comfort', side],
    queryFn: async () => (await axios.get<ComfortStatus>('comfort', { params: { side } })).data, refetchInterval: 10_000, retry: 1 });
  const save = useMutation({ mutationFn: async (reset: boolean) => {
    const response = await axios.post<ComfortStatus>('comfort', { side, config: draft ?? state.data!.config, reset });
    return response.data;
  }, onSuccess: (data) => { queries.setQueryData(['comfort', side], data); setDraft(null); } });
  const status = state.data;
  const config = draft ?? status?.config;
  const celsius = preferences?.temperatureFormat === 'celsius';
  const temperature = (value: number | null | undefined) => value == null ? '—'
    : `${Math.round(celsius ? (value - 32) * 5 / 9 : value)}°${celsius ? 'C' : 'F'}`;
  const offset = status ? (celsius ? status.offsetF * 5 / 9 : status.offsetF) : 0;
  const valid = config && Number.isInteger(config.minimumF) && Number.isInteger(config.maximumF)
    && config.minimumF >= 55 && config.maximumF <= 110 && config.minimumF <= config.maximumF;
  const edit = (changes: Partial<ComfortConfig>) => setDraft({ ...config!, ...changes });
  return <Surface
    title="Comfort that learns"
    eyebrow="ADAPTIVE COMFORT"
    action={ <Chip label={ status?.config.mode === 'active' ? 'Active' : status?.config.mode === 'preview' ? 'Preview' : 'Off' } /> }>
    <Typography color="text.secondary">Small temperature adjustments guided by your morning check-ins.</Typography>
    { state.isError && <Alert severity="error" sx={ { mt: 2 } }>Comfort settings are unavailable. Check your Pod connection.</Alert> }
    { !status && !state.isError && <Typography sx={ { mt: 2 } }>Loading comfort settings…</Typography> }
    { status && config && <Stack spacing={ 2 } sx={ { mt: 2 } }>
      <Box sx={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 } }>
        <Box><Typography variant="caption" color="text.secondary">Learned adjustment</Typography>
          <Typography variant="h3" sx={ { mt: 0.5 } }>
            { offset > 0 ? '+' : '' }{ Number(offset.toFixed(1)) }°{ celsius ? 'C' : 'F' }
          </Typography></Box>
        <Box><Typography variant="caption" color="text.secondary">Proposed target</Typography>
          <Typography variant="h3" sx={ { mt: 0.5 } }>{ temperature(status.decision.proposedF) }</Typography></Box>
      </Box>
      <Typography variant="body2" color="text.secondary">{ status.decision.reason }</Typography>
      { status.pausedUntil != null && status.pausedUntil > Date.now() && <Typography variant="caption" color="text.secondary">
        Paused until { new Date(status.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }.
      </Typography> }
      <TextField
        select
        label="Comfort mode"
        value={ config.mode }
        disabled={ save.isPending }
        onChange={ event => edit({ mode: event.target.value as ComfortConfig['mode'] }) }>
        <MenuItem value="off">Off</MenuItem>
        <MenuItem value="preview">Preview · show proposals</MenuItem>
        <MenuItem value="active">Active · adjust temperatures</MenuItem>
      </TextField>
      <Box sx={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 } }>
        <TextField
          label="Minimum (°F)"
          type="number"
          value={ config.minimumF }
          disabled={ save.isPending }
          slotProps={ { htmlInput: { min: 55, max: 110, step: 1 } } }
          onChange={ event => edit({ minimumF: Number(event.target.value) }) } />
        <TextField
          label="Maximum (°F)"
          type="number"
          value={ config.maximumF }
          disabled={ save.isPending }
          slotProps={ { htmlInput: { min: 55, max: 110, step: 1 } } }
          onChange={ event => edit({ maximumF: Number(event.target.value) }) } />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Learns at most 1°F from three new check-ins, up to ±3°F from your routine. Needs fresh presence.
        Manual controls pause it for six hours; your routine continues. Preview never changes the Pod.
      </Typography>
      <Box sx={ { display: 'flex', flexWrap: 'wrap', gap: 1 } }>
        <Button variant="contained" disabled={ !draft || save.isPending || !valid } onClick={ () => save.mutate(false) }>
          { save.isPending ? 'Saving…' : 'Save comfort settings' }</Button>
        <Button disabled={ save.isPending || status.offsetF === 0 || draft !== null } onClick={ () => save.mutate(true) }>Reset learning</Button>
      </Box>
      { save.isError && <Alert severity="error">{ errorMessage(save.error) }</Alert> }
      <Button onClick={ () => setExpanded(!expanded) } aria-expanded={ expanded } sx={ { alignSelf: 'flex-start' } }>
        { expanded ? 'Hide' : 'Show' } recent activity</Button>
      { expanded && <Stack spacing={ 1.5 }>{ status.history.length === 0 ? <Typography variant="body2">No comfort activity yet.</Typography>
        : status.history.slice(0, 8).map((event, index) => <Box key={ `${event.at}-${index}` }>
          <Typography variant="caption" color="text.secondary">{ new Date(event.at).toLocaleString() }</Typography>
          <Typography variant="body2">{ event.message }</Typography></Box>) }</Stack> }
    </Stack> }
  </Surface>;
}
