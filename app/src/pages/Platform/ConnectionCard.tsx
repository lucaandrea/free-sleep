import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import FormField from '@components/FormField';
import { readConnection, saveConnection, testConnection, type ConnectionIdentity } from '@api/connectionSetup';
import Surface from './Surface';

const demo = import.meta.env.VITE_ENV === 'demo';
export default function ConnectionCard() {
  const [initial] = useState(() => {
    try { return { ...readConnection({ local: localStorage, session: sessionStorage }, demo), error: '' }; }
    catch { return { address: '', token: '', error: 'Browser storage is unavailable. Check its settings before saving.' }; }
  });
  const [address, setAddress] = useState(initial.address);
  const [token, setToken] = useState(initial.token);
  const [failure, setFailure] = useState(initial.error);
  const [result, setResult] = useState<ConnectionIdentity>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => pending.current?.abort(), []);
  const reset = () => { pending.current?.abort(); setBusy(false); setResult(undefined); setFailure(''); setMessage(''); };
  const check = async () => {
    reset(); const controller = new AbortController(); pending.current = controller; setBusy(true);
    const timer = setTimeout(() => controller.abort('timeout'), 12000);
    try {
      const identity = await testConnection({ address, token }, window.location.origin, demo, controller.signal);
      if (!controller.signal.aborted && pending.current === controller) setResult(identity);
    } catch (error) {
      if (pending.current === controller && (!controller.signal.aborted || controller.signal.reason === 'timeout')) {
        setFailure(controller.signal.reason === 'timeout' ? 'The connection test timed out. Check the address and network.'
          : error instanceof Error ? error.message : 'Connection test failed.');
      }
    } finally { clearTimeout(timer); if (pending.current === controller) setBusy(false); }
  };
  const save = () => {
    try {
      saveConnection({ local: localStorage, session: sessionStorage }, { address, token }, window.location.origin, demo);
      if (demo) setMessage('Demo connection saved for this preview. Your saved connection is unchanged.');
      else window.location.reload();
    } catch (error) { setFailure(error instanceof Error ? error.message : 'Connection could not be saved.'); }
  };
  return <Surface title="Your Pod connection" eyebrow="LOCAL FIRST">
    <Stack spacing={ 2 }>
      <Typography color="text.secondary">Connect at home or through your secure gateway. Check the connection before saving.</Typography>
      <FormField title="Pod or secure gateway address">
        <TextField
          value={ address }
          placeholder="http://free-sleep.local:3000"
          disabled={ busy }
          slotProps={ { htmlInput: { 'aria-label': 'Pod or secure gateway address', autoCapitalize: 'none', spellCheck: false } } }
          onChange={ event => { reset(); setAddress(event.target.value); setToken(''); } } />
      </FormField>
      <Typography variant="caption" color="text.secondary">
        Leave blank for this website's server. Changing the address clears the token field.
      </Typography>
      <FormField title="Connection token">
        <TextField
          type="password"
          value={ token }
          autoComplete="off"
          disabled={ busy }
          slotProps={ { htmlInput: { 'aria-label': 'Connection token' } } }
          onChange={ event => { reset(); setToken(event.target.value); } } />
      </FormField>
      <Typography variant="caption" color="text.secondary">
        Your token stays in this browser session. Cloud model keys belong on your server.
      </Typography>
      <Button variant="outlined" disabled={ busy } onClick={ check }>{ busy ? 'Testing connection…' : 'Test connection' }</Button>
      <Button variant="contained" disabled={ busy } onClick={ save }>Save connection</Button>
      { result && <Alert severity="success">
        { demo ? 'Demo connection verified' : 'Connection verified' } · { result.id } · { result.timeZone }
      </Alert> }
      { failure && <Alert severity="error">{ failure }</Alert> }
      { message && <Typography role="status" color="success.main">{ message }</Typography> }
    </Stack>
  </Surface>;
}
