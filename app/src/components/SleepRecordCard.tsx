import { Box, Card, Typography } from '@mui/material';
import type { SleepRecord } from '../../../server/src/db/sleepRecordsSchema';
import moment from 'moment-timezone';
import { useSettings } from '@api/settings';
import SleepRecordActions from './SleepRecordActions';

export default function SleepRecordCard({ sleepRecord }: { sleepRecord?: SleepRecord }) {
  const { data: settings } = useSettings();
  if (!sleepRecord) return null;
  const timeZone = settings?.timeZone ?? 'UTC';
  const start = moment(sleepRecord.entered_bed_at).tz(timeZone);
  const end = moment(sleepRecord.left_bed_at).tz(timeZone);
  const minutes = Math.floor(end.diff(start, 'seconds') / 60);
  return <Card sx={ { p: 2 } }>
    <Typography variant="h6" gutterBottom>Recorded episode</Typography>
    <Typography color="text.secondary" sx={ { mb: 2 } }>{ timeZone }</Typography>
    <Box sx={ { display: 'flex', flexDirection: 'column', gap: 1, mb: 2 } }>
      { [
        ['Entered bed', start.format('MMM D, YYYY HH:mm z')],
        ['Left bed', end.format('MMM D, YYYY HH:mm z')],
        ['Episode window', `${Math.floor(minutes / 60)}h ${minutes % 60}m`],
        ['Recorded exits', sleepRecord.times_exited_bed],
      ].map(([label, value]) => <Box key={ label } sx={ { display: 'flex', justifyContent: 'space-between', gap: 2 } }>
        <Typography sx={ { fontWeight: 600 } }>{ label }</Typography><Typography>{ value }</Typography>
      </Box>) }
    </Box>
    <SleepRecordActions key={ `${sleepRecord.side}:${sleepRecord.id}` } record={ sleepRecord } timeZone={ timeZone } />
  </Card>;
}
