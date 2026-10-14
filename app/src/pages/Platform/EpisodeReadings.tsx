import { useState } from 'react';
import { Box, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import moment from 'moment-timezone';
import type { EpisodeDetail } from '../../../../server/src/analytics/episode';

export default function EpisodeReadings({ detail }: { detail: EpisodeDetail }) {
  const [page, setPage] = useState(0);
  const count = Math.max(1, Math.ceil(detail.samples.length / 20));
  return <Stack spacing={ 2 }>
    <Typography variant="caption" color="text.secondary">
      Original recorded values, including those excluded from charts. HR in bpm; HRV in ms; breathing per minute. Missing readings are not zero.
    </Typography>
    <Box sx={ { overflowX: 'auto' } }>
      <Table size="small" aria-label="Recorded vital readings" sx={ { minWidth: 430 } }>
        <TableHead><TableRow>
          { ['Pod local time', 'HR', 'HRV', 'Breathing', 'Presence'].map(label => <TableCell key={ label }>{ label }</TableCell>) }
        </TableRow></TableHead>
        <TableBody>{ detail.samples.slice(page * 20, page * 20 + 20).map((sample, index) => <TableRow key={ index }>
          <TableCell>{ moment.unix(sample.at).tz(detail.timeZone).format('MM/DD HH:mm:ss z') }</TableCell>
          { [sample.heartRate, sample.hrv, sample.respiratoryRate].map((value, column) => <TableCell key={ column }>
            { value == null ? '—' : Math.round(value * 10) / 10 }
          </TableCell>) }
          <TableCell>{ sample.present === null ? 'Unknown' : sample.present ? 'Detected' : 'Outside' }</TableCell>
        </TableRow>) }</TableBody>
      </Table>
    </Box>
    { !detail.samples.length && <Typography>No readings were recorded in this episode.</Typography> }
    <Stack direction="row" sx={ { justifyContent: 'space-between', alignItems: 'center' } }>
      <Button disabled={ page === 0 } onClick={ () => setPage(value => value - 1) }>Previous</Button>
      <Typography variant="caption">{ page + 1 } / { count }</Typography>
      <Button disabled={ page + 1 >= count } onClick={ () => setPage(value => value + 1) }>Next</Button>
    </Stack>
  </Stack>;
}
