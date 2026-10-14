import { Alert, Button, Chip, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios, { baseURL } from '@api/api';
import Surface from './Surface';

type HomeStatus = { enabled: boolean; running: boolean; pairingCode: string | null; error: string | null };
export default function HomeConnectionCard() {
  const home = useQuery({ queryKey: ['homekit', baseURL], retry: 1,
    queryFn: async ({ signal }) => (await axios.get<HomeStatus>('integrations/homekit', { signal })).data });
  const label = home.isPending ? 'Checking bridge' : home.isError ? 'Unavailable' : home.data?.error ? 'Needs attention'
    : home.data?.running ? 'Bridge running' : home.data?.enabled ? 'Starting bridge' : 'Bridge off';
  return <Surface title="Apple Home" eyebrow="CONNECTED HOME" action={ <Chip label={ label } size="small" /> }>
    <Stack spacing={ 2 }>
      <Typography color="text.secondary">Control each bed side's temperature, run base presets and use your Home scenes.</Typography>
      { home.isError ? <Alert severity="error">Bridge status is unavailable. Check your saved Pod connection and retry.</Alert>
        : home.data && <>
          <Typography variant="body2" color="text.secondary">{ home.data.running
            ? 'On your home network, open Apple Home, choose Add Accessory, then More options and select Free Sleep. Enter the code below.'
            : 'Enable the local Home bridge on your Pod to begin. Your Pod must be reachable on your home network for pairing.' }</Typography>
          { home.data.running && home.data.pairingCode && <Typography variant="h2" sx={ { fontVariantNumeric: 'tabular-nums' } }>
            { home.data.pairingCode }
          </Typography> }
          { home.data.error && <Alert severity="error">{ home.data.error }</Alert> }
        </> }
      <Button variant="outlined" disabled={ home.isFetching } onClick={ () => home.refetch() }>
        { home.isFetching ? 'Checking bridge…' : 'Refresh bridge status' }
      </Button>
      <Typography variant="caption" color="text.secondary">
        Bridge status does not confirm Apple Home pairing. Use your iPhone to authorize Home access and run scenes.
      </Typography>
    </Stack>
  </Surface>;
}
