import { Box, Stack, Typography } from '@mui/material';
import type { DataCoverage } from '../../../../server/src/analytics/coverage';

type Window = NonNullable<DataCoverage['recent']>;
const stateLabel = { known: 'Known presence', unknown: 'Presence unknown', not_returned: 'No record returned' };
export default function DataCoverageWindow({ title, window }: { title: string; window: Window }) {
  return <Stack spacing={ 1 }>
    <Typography variant="h5">{ title }</Typography>
    <Typography variant="caption" color="text.secondary">{ window.from } → { window.through }</Typography>
    <Typography><strong>{ window.presenceNights } of 7</strong> dates with known presence</Typography>
    <Typography variant="body2" color="text.secondary">
      { window.recordedNights } recorded · { window.heartRateNights } with heart rate · { window.hrvNights } with HRV
      { ' · ' }{ window.respiratoryRateNights } with breathing
    </Typography>
    <Box component="details">
      <Box component="summary" sx={ { cursor: 'pointer', color: 'primary.main', py: 1.5, minHeight: 44 } }>Review the dates</Box>
      <Stack spacing={ 1 } sx={ { mt: 1 } }>
        { window.days.map(day => <Box key={ day.date } sx={ { display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'space-between' } }>
          <Typography variant="body2">{ day.date }</Typography>
          <Typography variant="body2" color={ day.status === 'known' ? 'text.secondary' : 'warning.main' }>
            { stateLabel[day.status] ?? 'Coverage unknown' }
          </Typography>
        </Box>) }
      </Stack>
    </Box>
  </Stack>;
}
