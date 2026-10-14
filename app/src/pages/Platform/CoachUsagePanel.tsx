import { useState } from 'react';
import { Alert, Button, Divider, Stack, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios, { baseURL } from '@api/api';
import { errorMessage } from '@api/platform';
import type { CoachUsage } from '../../../../server/src/ai/usageContract';
import FormField from '@components/FormField';
import Surface from './Surface';

const providerName: Record<string, string> = { openai: 'OpenAI', gemini: 'Gemini', anthropic: 'Anthropic', ollama: 'Ollama' };
export default function CoachUsagePanel() {
  const queryClient = useQueryClient();
  const usage = useQuery({ queryKey: ['model-usage', baseURL], retry: 1,
    queryFn: async ({ signal }) => (await axios.get<CoachUsage>('ai/usage', { signal })).data });
  const [draft, setDraft] = useState<{ value: string; revision: number }>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const value = draft?.value ?? String(usage.data?.monthlyLimit ?? '');
  const valid = /^\d{1,4}$/.test(value) && Number(value) <= 1000;
  const save = async () => {
    if (!draft || !valid || saving) return;
    setSaving(true); setMessage(undefined); setFailure(undefined);
    try {
      const response = await axios.post<CoachUsage>('ai/usage/limit', {
        monthlyLimit: Number(draft.value), originalRevision: draft.revision,
      });
      queryClient.setQueryData(['model-usage', baseURL], response.data);
      setDraft(undefined); setMessage('Monthly model limit saved.');
    } catch (error) { setFailure(errorMessage(error)); }
    finally { setSaving(false); }
  };
  return <Surface title="Model usage" eyebrow="YOUR REQUESTS, YOUR LIMIT">
    <Stack spacing={ 2 }>
      <Typography variant="body2" color="text.secondary">
        Shared across both bed sides and all models. Local calculations do not use this allowance.
      </Typography>
      { usage.isPending && <Typography>Loading model usage…</Typography> }
      { usage.isError && <Alert severity="error">
        Model usage could not be loaded. Check the connection and update the server and gateway if needed.
      </Alert> }
      { usage.data && <>
        <Typography variant="h5">{ usage.data.attempts } of { usage.data.monthlyLimit } requests used</Typography>
        <Typography variant="caption" color="text.secondary">
          { usage.data.period } · UTC calendar month · { usage.data.remaining } remaining
        </Typography>
        { usage.data.remaining === 0 && <Alert severity="info">
          Model requests are paused at this limit. Local calculations remain available.
        </Alert> }
        <Typography variant="body2">
          { usage.data.completed } completed · { usage.data.failed } failed · { usage.data.pending } in progress
          { ' · ' }{ usage.data.unresolved } unresolved
        </Typography>
        <Typography variant="body2">
          { usage.data.totalTokens.toLocaleString() } reported tokens · usage available for
          { ' ' }{ usage.data.tokensReportedFor } of { usage.data.attempts } requests
        </Typography>
        <FormField title="Monthly model request limit">
          <TextField
            value={ value }
            disabled={ saving }
            error={ !valid }
            slotProps={ { htmlInput: { inputMode: 'numeric', 'aria-label': 'Monthly model request limit', maxLength: 4 } } }
            onChange={ event => {
              setDraft({ value: event.target.value, revision: draft?.revision ?? usage.data!.revision }); setMessage(undefined);
            } }
            helperText="0 pauses model requests. Choose a whole number up to 1000." />
        </FormField>
        <Stack direction="row" spacing={ 1 } sx={ { flexWrap: 'wrap', gap: 1 } }>
          <Button variant="contained" disabled={ saving || !draft || !valid } onClick={ save }>{ saving ? 'Saving…' : 'Save limit' }</Button>
          <Button
            disabled={ saving || !draft }
            onClick={ () => {
              setDraft(undefined); setFailure(undefined); setMessage(undefined);
            } }>Reset draft</Button>
        </Stack>
        { failure && <Alert severity="error">{ failure }</Alert> }
        { message && <Alert severity="success">{ message }</Alert> }
        { usage.data.providers.map(item => <Stack key={ item.provider } spacing={ 0.75 }>
          <Divider /><Typography variant="h5" component="h3">{ providerName[item.provider] ?? item.provider }</Typography>
          <Typography variant="caption" color="text.secondary" sx={ { overflowWrap: 'anywhere' } }>{ item.models.join(', ') }</Typography>
          <Typography variant="body2">
            { item.attempts } { item.attempts === 1 ? 'request' : 'requests' } · { item.completed } completed · { item.failed } failed
          </Typography>
          <Typography variant="body2">
            { item.inputTokens.toLocaleString() } input · { item.outputTokens.toLocaleString() } output tokens
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Usage available for { item.tokensReportedFor } of { item.attempts } requests · { item.averageResponseMilliseconds === null
              ? 'Response time unavailable' : `${(Math.round(item.averageResponseMilliseconds / 100) / 10).toFixed(1)}s average response` }
          </Typography>
        </Stack>) }
      </> }
      <Button disabled={ saving || usage.isFetching } onClick={ () => usage.refetch() }>Refresh usage</Button>
      <Typography variant="caption" color="text.secondary">
        Failed and unresolved attempts count toward the limit. Token totals include only reported usage and may be incomplete.
        This is a request limit, not a dollar spending cap; check your provider for charges.
      </Typography>
      <Typography variant="caption" color="text.secondary">
        The usage log stores model names, counts and timing. Questions, answers and health records are not saved in it.
      </Typography>
    </Stack>
  </Surface>;
}
