import { useState } from 'react';
import { Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import moment from 'moment-timezone';
import { durationLabel } from '@api/platform';
import type { EpisodeDetail } from '../../../../server/src/analytics/episode';
import EpisodePlot from './EpisodePlot';
import EpisodeReadings from './EpisodeReadings';

export default function EpisodeDetailPanel({ detail }: { detail: EpisodeDetail }) {
  const [metric, setMetric] = useState('heartRate');
  const [readings, setReadings] = useState(false);
  const plot = detail.plots.find(item => item.key === metric) ?? detail.plots[0];
  const episode = detail.episode;
  const clock = (seconds: number) => moment(episode.startedAt).add(seconds, 'seconds').tz(detail.timeZone).format('MMM D HH:mm');
  const presenceLabel = detail.presenceKnown
    ? detail.intervals.map(interval => `${clock(interval.start)} to ${clock(interval.end)}`).join('; ')
    : 'Presence intervals are unavailable.';
  return <Stack spacing={ 2.5 }>
    <Box sx={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 } }>
      { [['Bed presence', durationLabel(episode.occupiedMinutes)], ['Episode window', durationLabel(episode.windowMinutes)],
        ['Recorded exits', episode.exits], ['Recorded readings', detail.samples.length]].map(([title, value]) => <Box key={ title }>
        <Typography variant="caption" color="text.secondary">{ title }</Typography><Typography variant="h5">{ value }</Typography>
      </Box>) }
    </Box>
    <Stack spacing={ 1 }>
      <Typography variant="body2">Recorded presence</Typography>
      <Box
        role="img"
        aria-label={ presenceLabel }
        sx={ { position: 'relative', height: 14, bgcolor: 'divider', borderRadius: 1, overflow: 'hidden' } }>
        { detail.intervals.map(interval => <Box
          key={ interval.start }
          sx={ { position: 'absolute', top: 0, height: '100%', bgcolor: 'primary.main',
            left: `${interval.start / detail.durationSeconds * 100}%`,
            width: `${(interval.end - interval.start) / detail.durationSeconds * 100}%` } } />) }
      </Box>
      <Stack direction="row" sx={ { justifyContent: 'space-between' } }>
        <Typography variant="caption" color="text.secondary">{ clock(0) }</Typography>
        <Typography variant="caption" color="text.secondary">{ clock(detail.durationSeconds) }</Typography>
      </Stack>
      { !detail.presenceKnown && <Typography color="text.secondary">
        Presence intervals are unavailable. Vitals remain in the recorded readings below.
      </Typography> }
    </Stack>
    <ToggleButtonGroup
      value={ metric }
      exclusive
      aria-label="Vital metric"
      onChange={ (_, value: string | null) => { if (value) setMetric(value); } }
      sx={ { '& button': { flex: 1, minWidth: 0 } } }>
      <ToggleButton value="heartRate">Heart rate</ToggleButton>
      <ToggleButton value="hrv">HRV</ToggleButton>
      <ToggleButton value="respiratoryRate">Breathing</ToggleButton>
    </ToggleButtonGroup>
    <Box>
      <Typography variant="h5">{ plot.title }</Typography>
      <Typography variant="h3">
        { plot.average ?? '—' } <Typography component="span" color="text.secondary">{ plot.unit }</Typography>
      </Typography>
      <Typography variant="caption" color="text.secondary">
        { plot.count } eligible readings · { plot.minimum ?? '—' }–{ plot.maximum ?? '—' } { plot.unit }
      </Typography>
    </Box>
    <EpisodePlot detail={ detail } plot={ plot } />
    { detail.notes.slice(0, 2).map(note => <Typography key={ note } variant="caption" color="text.secondary">{ note }</Typography>) }
    <Button variant="outlined" aria-expanded={ readings } onClick={ () => setReadings(value => !value) }>
      { readings ? 'Hide recorded readings' : 'Show recorded readings' }
    </Button>
    { readings && <EpisodeReadings detail={ detail } /> }
  </Stack>;
}
