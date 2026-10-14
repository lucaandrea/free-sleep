import { Alert, Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useServerStatus } from '@api/serverStatus';
import { errorMessage } from '@api/platform';
import PageContainer from '../PageContainer';
import PageHeader from '@components/PageHeader';
import Surface from './Surface';
import StatusChip from '../StatusPage/StatusChip';

export default function SystemHealthPage() {
  const query = useServerStatus(5000);
  const rows = Object.entries(query.data ?? {}).sort((first, second) => first[1].name.localeCompare(second[1].name));
  return <PageContainer sx={ { maxWidth: 800 } }>
    <Button component={ Link } to="/settings" sx={ { alignSelf: 'flex-start' } }>Back to Settings</Button>
    <PageHeader title="System health" />
    <Typography color="text.secondary">Status reported by your Pod. Updates every five seconds while this page is open.</Typography>
    { query.isError && <Alert severity="error">
      { errorMessage(query.error) }{ query.data && ' The last successful snapshot is shown below.' }
    </Alert> }
    { query.dataUpdatedAt > 0 && <Typography variant="caption" color="text.secondary">
        Last received: { new Date(query.dataUpdatedAt).toLocaleTimeString() }
    </Typography> }
    <Button variant="outlined" disabled={ query.isFetching } onClick={ () => query.refetch() }>
      { query.isFetching ? 'Refreshing…' : 'Refresh status' }
    </Button>
    { !query.isLoading && !query.isError && rows.length === 0 && <Typography>No service status was returned.</Typography> }
    { rows.map(([key, status]) => <Surface key={ key } title={ status.name }>
      <Stack spacing={ 1.5 } sx={ { alignItems: 'flex-start' } }>
        <StatusChip info={ status } />
        <Typography color="text.secondary">{ status.description }</Typography>
        { status.message && <Typography sx={ { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }>{ status.message }</Typography> }
        { status.timestamp && <Typography variant="caption" color="text.secondary">
        Reported: { new Date(status.timestamp).toLocaleString() }
        </Typography> }
      </Stack>
    </Surface>) }
    <Button component={ Link } to="/status">Maintenance status</Button>
  </PageContainer>;
}
