import { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios, { baseURL } from '@api/api';
import { Coach, errorMessage } from '@api/platform';
import PageContainer from '../PageContainer';
import PageHeader from '@components/PageHeader';
import SideControl from '@components/SideControl';
import FormField from '@components/FormField';
import Surface from './Surface';

type Provider = { provider: string; configured: boolean; model: string };
export default function CoachWorkspace({ side }: { side: 'left' | 'right' }) {
  const [provider, setProvider] = useState('rules');
  const [days, setDays] = useState(30);
  const [share, setShare] = useState(false);
  const [question, setQuestion] = useState('What patterns stand out in my recent nights?');
  const [result, setResult] = useState<Coach>();
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const providers = useQuery({ queryKey: ['providers', baseURL],
    queryFn: async ({ signal }) => (await axios.get<Provider[]>('ai/providers', { signal })).data });
  const configured = provider === 'rules' || providers.data?.some(item => item.provider === provider && item.configured);
  useEffect(() => () => request.current?.abort(), []);
  const reset = () => { request.current?.abort(); setResult(undefined); setFailure(undefined); setShare(false); setBusy(false); };
  // A request owns a snapshot; aborts and superseded replies never populate a different side or form.
  const generate = async () => {
    if (busy || !configured || (provider !== 'rules' && !share)) return;
    const controller = new AbortController(); request.current = controller;
    const input = { side, days, provider, shareSummary: share, question: provider === 'rules' ? '' : question };
    setShare(false); setBusy(true); setResult(undefined); setFailure(undefined);
    try {
      const response = await axios.post<Coach>('ai/coach', input, { timeout: 50000, signal: controller.signal });
      if (!controller.signal.aborted && request.current === controller) setResult(response.data);
    } catch (error) {
      if (!controller.signal.aborted && request.current === controller) setFailure(errorMessage(error));
    } finally {
      if (!controller.signal.aborted && request.current === controller) setBusy(false);
    }
  };
  return <PageContainer sx={ { maxWidth: 800 } }>
    <PageHeader title="A little perspective." />
    <Typography color="text.secondary" sx={ { mt: -1.5 } }>Thoughtful insights, grounded in your own routine.</Typography>
    <SideControl />
    <Surface title="What would you like to explore?" eyebrow="YOUR SLEEP COACH">
      <Stack spacing={ 2 }>
        <FormField title="History range">
          <ToggleButtonGroup
            value={ days }
            exclusive
            disabled={ busy }
            aria-label="History range"
            onChange={ (_, value: number | null) => { if (value) { reset(); setDays(value); } } }>
            { [7, 30, 90].map(value => <ToggleButton key={ value } value={ value } sx={ { flex: 1 } }>{ value } days</ToggleButton>) }
          </ToggleButtonGroup>
        </FormField>
        <FormField title="Insight source">
          <TextField
            select
            value={ provider }
            disabled={ busy }
            sx={ { '&& .MuiSelect-select': { whiteSpace: 'normal', overflowWrap: 'anywhere' } } }
            slotProps={ { select: { inputProps: { 'aria-label': 'Insight source' } } } }
            onChange={ event => { reset(); setProvider(event.target.value); } }>
            <MenuItem value="rules" sx={ { whiteSpace: 'normal' } }>Local calculations · no model or sharing</MenuItem>
            { providers.data?.filter(item => item.provider !== 'rules').map(item => <MenuItem
              key={ item.provider }
              value={ item.provider }
              sx={ { whiteSpace: 'normal', overflowWrap: 'anywhere' } }
              disabled={ !item.configured }>{ item.model }{ !item.configured ? ' · set up on server' : '' }</MenuItem>) }
          </TextField>
        </FormField>
        { providers.isPending && <Typography variant="caption">Checking model availability…</Typography> }
        { providers.isError && <Alert severity="error" action={ <Button onClick={ () => providers.refetch() }>Retry</Button> }>
          Model availability could not be loaded. Local calculations remain available.
        </Alert> }
        { provider === 'rules'
          ? <Typography variant="body2" color="text.secondary">
            Local calculations summarize this range. Choose a model to ask a question.
          </Typography>
          : <>
            <FormField title="Your question">
              <TextField
                multiline
                minRows={ 3 }
                value={ question }
                disabled={ busy }
                slotProps={ { htmlInput: { maxLength: 1000, 'aria-label': 'Your question' } } }
                onChange={ event => { reset(); setQuestion(event.target.value); } } />
            </FormField>
            <FormControlLabel
              control={ <Checkbox disabled={ busy } checked={ share } onChange={ (_, checked) => setShare(checked) } /> }
              label="Share my numerical sleep summary and this question with the selected model for this request." />
          </> }
        <Button
          variant="contained"
          disabled={ busy || !configured || (provider !== 'rules' && (!share || !question.trim())) }
          onClick={ generate }>{ busy ? 'Finding perspective…' : 'Explore my nights' }</Button>
        <Typography variant="caption" color="text.secondary">
          Suggestions support your routine. They do not diagnose conditions or change your bed.
        </Typography>
      </Stack>
    </Surface>
    { failure && <Alert severity="error">{ failure }</Alert> }
    { result && <Surface title={ result.headline } eyebrow={ result.model }>
      <Stack spacing={ 2 }>
        <Typography variant="caption" color="text.secondary">{ side[0].toUpperCase() + side.slice(1) } side · { days } days</Typography>
        { result.observations.map((text, index) => <Typography key={ index }>{ text }</Typography>) }
        <Typography variant="h5">Try one small change</Typography>
        { result.suggestions.map((text, index) => <Typography key={ index }>{ text }</Typography>) }
        { result.limitations.map((text, index) => <Typography variant="caption" color="text.secondary" key={ index }>{ text }</Typography>) }
      </Stack>
    </Surface> }
  </PageContainer>;
}
