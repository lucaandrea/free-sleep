import { Box, Chip, Stack, Typography } from '@mui/material';
import type { DataCoverage } from '../../../../server/src/analytics/coverage';
import Surface from './Surface';
import DataCoverageWindow from './DataCoverageWindow';

export default function DataCoverageCard({ report, timeZone }: { report?: DataCoverage; timeZone: string }) {
  return <Surface title="Understand the data" eyebrow="BEHIND THE NUMBERS">
    { !report ? <Typography color="text.secondary">Update your Free Sleep server to see coverage details.</Typography> : <Stack spacing={ 2 }>
      <Chip
        label={ report.comparisonAvailable ? 'Weekly comparison available' : 'Weekly comparison unavailable' }
        color={ report.comparisonAvailable ? 'success' : 'default' }
        sx={ { alignSelf: 'flex-start', height: 'auto', '& .MuiChip-label': { py: 1, whiteSpace: 'normal' } } }
      />
      <Typography>{ report.comparisonReason }</Typography>
      { report.recent && report.previous ? <>
        <Typography variant="caption" color="text.secondary">Periods end on the latest returned wake date · { timeZone }</Typography>
        <Box sx={ { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 } }>
          <DataCoverageWindow title="Recent period" window={ report.recent } />
          <DataCoverageWindow title="Previous period" window={ report.previous } />
        </Box>
      </> : <Typography>No recorded nights were returned for this range.</Typography> }
      { report.excludedEpisodes > 0 && <Typography color="warning.main">
        { report.excludedEpisodes } episode(s) with invalid times or windows over 72 hours were excluded.
      </Typography> }
      <Typography variant="caption" color="text.secondary">{ report.scopeNote }</Typography>
      <Typography variant="caption" color="text.secondary">
        Counts describe returned records, not sensor uptime. Bed presence is not measured sleep.
      </Typography>
    </Stack> }
  </Surface>;
}
