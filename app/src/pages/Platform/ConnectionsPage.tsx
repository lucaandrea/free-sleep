import { useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import axios from '@api/api';
import PageContainer from '../PageContainer';
import PageHeader from '@components/PageHeader';
import Surface from './Surface';

export default function ConnectionsPage() {
  const [address, setAddress] = useState(localStorage.getItem('freeSleepURL') || '');
  const [token, setToken] = useState(sessionStorage.getItem('freeSleepToken') || '');
  const [error, setError] = useState('');
  const home = useQuery({
    queryKey: ['homekit'],
    queryFn: async () =>
      (
        await axios.get<{ enabled: boolean; running: boolean; pairingCode: string | null; error: string | null }>(
          'integrations/homekit',
        )
      ).data,
  });
  const save = () => {
    try {
      const url = address ? new URL(address) : new URL(window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Use an http or https address without credentials.');
      if (window.location.protocol === 'https:' && url.protocol === 'http:')
        throw new Error('This hosted app needs an HTTPS connection to your Pod.');
      localStorage.setItem('freeSleepURL', address ? url.origin : '');
      sessionStorage.setItem('freeSleepToken', token.trim());
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invalid address');
    }
  };
  return (
    <PageContainer sx={ { maxWidth: 800 } }>
      <PageHeader title="Make it yours." />
      <Surface title="Your Pod connection" eyebrow="LOCAL FIRST">
        <Stack spacing={ 2.5 }>
          <TextField
            label="Pod or secure gateway address"
            placeholder="http://free-sleep.local:3000"
            helperText="Leave blank when this app is served by your Pod."
            value={ address }
            onChange={ (event) => setAddress(event.target.value) }
          />
          <TextField
            type="password"
            label="Connection token"
            value={ token }
            autoComplete="off"
            onChange={ (event) => setToken(event.target.value) }
            helperText="Stored for this browser session. Use the token configured on your server."
          />
          <Button variant="contained" onClick={ save }>
            Save connection
          </Button>
          { error && <Alert severity="error">{ error }</Alert> }
          <TextField
            select
            label="Appearance"
            defaultValue={ localStorage.getItem('freeSleepAppearance') || 'light' }
            onChange={ (event) => {
              localStorage.setItem('freeSleepAppearance', event.target.value);
              window.location.reload();
            } }
          >
            <MenuItem value="light">Warm daylight</MenuItem>
            <MenuItem value="dark">Quiet night</MenuItem>
          </TextField>
        </Stack>
      </Surface>
      <Surface title="Apple Home" eyebrow="CONNECTED HOME">
        <Stack spacing={ 2 }>
          <Typography color="text.secondary">
            { home.data?.running
              ? 'Your local bridge is running. Add an accessory in Apple Home and enter its pairing code.'
              : 'Enable the Home bridge on your Pod to control bed temperature and position presets in Apple Home.' }
          </Typography>
          { home.data?.pairingCode && (
            <Typography variant="h2" sx={ { fontVariantNumeric: 'tabular-nums' } }>
              { home.data.pairingCode }
            </Typography>
          ) }
          { home.data?.error && <Alert severity="error">{ home.data.error }</Alert> }
          { home.isError && <Alert severity="info">Connect to your Pod to check the Home bridge.</Alert> }
        </Stack>
      </Surface>
      <Surface title="Apple Health & Shortcuts" eyebrow="ON YOUR IPHONE">
        <Typography color="text.secondary">
          Use the native Free Sleep app to choose Health permissions and sync your side of the bed. Bed presence is exported as
          time in bed. Native Shortcuts let you set temperature, power, and bed position.
        </Typography>
      </Surface>
      <Surface title="Fine-tune your setup">
        <Stack direction="row" sx={ { flexWrap: 'wrap' } } spacing={ 1 }>
          <Button component={ Link } to="/settings/device" variant="outlined">
            Device settings
          </Button>
          <Button component={ Link } to="/status" variant="outlined">
            System health
          </Button>
          <Button component={ Link } to="/data/logs" variant="outlined">
            Logs
          </Button>
        </Stack>
      </Surface>
    </PageContainer>
  );
}
