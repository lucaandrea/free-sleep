import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from '@api/api';
import { Coach, errorMessage } from '@api/platform';
import { useAppStore } from '@state/appStore';
import PageContainer from '../PageContainer';
import PageHeader from '@components/PageHeader';
import SideControl from '@components/SideControl';
import Surface from './Surface';

export default function CoachPage() {
  const { side } = useAppStore();
  const [provider, setProvider] = useState('rules');
  const [share, setShare] = useState(false);
  const [question, setQuestion] = useState('What patterns stand out in my recent nights?');
  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: async () => (await axios.get<{ provider: string; configured: boolean; model: string }[]>('ai/providers')).data,
  });
  const coach = useMutation({
    mutationFn: async () =>
      (await axios.post<Coach>('ai/coach', { side, days: 30, provider, shareSummary: share, question }, { timeout: 50000 })).data,
  });
  useEffect(() => { coach.reset(); setShare(false); }, [side]);
  return (
    <PageContainer sx={ { maxWidth: 800 } }>
      <PageHeader title="A little perspective." />
      <Typography color="text.secondary" sx={ { mt: -1.5 } }>
        Thoughtful insights, grounded in your own routine.
      </Typography>
      <SideControl />
      <Surface title="What would you like to explore?" eyebrow="YOUR SLEEP COACH">
        <Stack spacing={ 2.5 }>
          <TextField
            select
            label="Insight source"
            value={ provider }
            onChange={ (event) => {
              setProvider(event.target.value);
              setShare(false);
              coach.reset();
            } }
          >
            <MenuItem value="rules">On-device insights · no AI or data sharing</MenuItem>
            { providers.data
              ?.filter((item) => item.provider !== 'rules')
              .map((item) => (
                <MenuItem key={ item.provider } value={ item.provider } disabled={ !item.configured }>
                  { item.model }
                  { !item.configured ? ' · set up on server' : '' }
                </MenuItem>
              )) }
          </TextField>
          <TextField
            label="Your question"
            multiline
            minRows={ 3 }
            value={ question }
            onChange={ (event) => setQuestion(event.target.value) }
            slotProps={ { htmlInput: { maxLength: 1000 } } }
          />
          { provider !== 'rules' && (
            <FormControlLabel
              control={ <Checkbox checked={ share } onChange={ (_, checked) => setShare(checked) } /> }
              label="Share my numerical sleep summary and this question with the selected model for this request."
            />
          ) }
          <Button
            variant="contained"
            disabled={ coach.isPending || (provider !== 'rules' && !share) }
            onClick={ () => coach.mutate() }
          >
            { coach.isPending ? 'Finding perspective…' : 'Explore my nights' }
          </Button>
          <Typography variant="caption" color="text.secondary">
            Suggestions support your routine. They do not diagnose conditions or change your bed.
          </Typography>
        </Stack>
      </Surface>
      { coach.isError && <Alert severity="error">{ errorMessage(coach.error) }</Alert> }
      { coach.data && (
        <Surface title={ coach.data.headline } eyebrow={ coach.data.model }>
          <Stack spacing={ 2 }>
            { coach.data.observations.map((text) => (
              <Typography key={ text }>{ text }</Typography>
            )) }
            <Typography variant="h5">Try one small change</Typography>
            { coach.data.suggestions.map((text) => (
              <Typography key={ text }>{ text }</Typography>
            )) }
            { coach.data.limitations.map((text) => (
              <Typography variant="caption" color="text.secondary" key={ text }>
                { text }
              </Typography>
            )) }
          </Stack>
        </Surface>
      ) }
    </PageContainer>
  );
}
