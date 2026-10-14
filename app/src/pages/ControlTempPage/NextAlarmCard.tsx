import { useState } from 'react';
import moment from 'moment-timezone';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useNextAlarm } from '@api/alarm';
import AlarmEditor, { type AlarmEdit } from './AlarmEditor';
import type { Side } from '../../../../server/src/db/schedulesSchema';

export default function NextAlarmCard({ side }: { side: Side }) {
  const query = useNextAlarm(side);
  const [edit, setEdit] = useState<AlarmEdit | null>(null);
  const preview = query.data;
  const alarm = preview?.alarm;
  const date = alarm && preview ? moment.tz(alarm.at, preview.timeZone) : null;
  const overridden = alarm?.source === 'override';
  const paused = preview?.state === 'paused';
  const badge = overridden ? 'Changed once' : paused ? 'Paused'
    : preview?.state === 'scheduled' ? 'Routine' : preview?.state === 'away' ? 'Away' : 'Not set';
  const title = query.isError ? 'Alarm unavailable' : preview?.state === 'away' ? 'Away mode' : paused ? 'Routine alarm paused'
    : date ? date.format('h:mm A') : preview ? 'No alarm scheduled' : 'Loading alarm…';
  const detail = preview?.state === 'away' ? 'Alarms are paused for this side while Away mode is on.' : paused && preview.expiresAt
    ? `Until ${moment.tz(preview.expiresAt, preview.timeZone).format('ddd, MMM D · h:mm A')} · ${preview.timeZone}`
    : date && preview ? `${date.format('ddd, MMM D')} · ${preview.timeZone}` : 'Set a vibration alarm in Routines.';

  return <Paper sx={ { p: 2.5 } }>
    <Stack spacing={ 2.5 }>
      <Stack direction="row" sx={ { justifyContent: 'space-between', alignItems: 'center', gap: 1 } }>
        <Box><Typography variant="overline">NEXT ALARM</Typography>
          <Typography component="h2" sx={ { fontSize: 20, fontWeight: 600, letterSpacing: '-0.025em' } }>{ title }</Typography></Box>
        { preview && !query.isError && <Chip size="small" label={ badge } /> }
      </Stack>
      { !query.isError && preview && <Typography variant="body2" color="text.secondary">{ detail }</Typography> }
      { query.isError ? <Alert severity="error" action={ <Button onClick={ () => query.refetch() }>Retry</Button> }>
        Check your Pod connection and server version.
      </Alert> : preview && <>
        <Stack direction="row" useFlexGap sx={ { gap: 1, flexWrap: 'wrap' } }>
          { alarm && <><Button variant="outlined" onClick={ () => setEdit({ action: 'time', preview }) }>Change time</Button>
            <Button variant="outlined" onClick={ () => setEdit({ action: 'disable', preview }) }>Skip once</Button></> }
          { preview.expiresAt && <Button variant="outlined" onClick={ () => setEdit({ action: 'restore', preview }) }>Use routine</Button> }
        </Stack>
        { alarm && <Typography variant="caption" color="text.secondary">Vibration requires this side to be on.</Typography> }
      </> }
    </Stack>
    { edit && <AlarmEditor edit={ edit } onClose={ () => setEdit(null) } /> }
  </Paper>;
}
