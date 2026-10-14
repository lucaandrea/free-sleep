import { Box, Typography } from '@mui/material';
import moment from 'moment-timezone';
import type { EpisodeDetail } from '../../../../server/src/analytics/episode';

export default function EpisodePlot({ detail, plot }: { detail: EpisodeDetail; plot: EpisodeDetail['plots'][number] }) {
  if (plot.minimum === null || plot.maximum === null) {
    return <Typography color="text.secondary">No eligible readings for this metric.</Typography>;
  }
  const padding = Math.max(1, (plot.maximum - plot.minimum) * 0.2);
  const low = Math.max(0, plot.minimum - padding), high = plot.maximum + padding;
  const horizontal = (seconds: number) => 40 + seconds / detail.durationSeconds * 348;
  const vertical = (value: number) => 20 + (high - value) / (high - low) * 108;
  return <Box
    component="svg"
    viewBox="0 0 400 160"
    role="img"
    aria-label={ `${plot.title}: ${plot.count} eligible readings, range ${plot.minimum} to ${plot.maximum} ${plot.unit}. `
      + 'Gaps remain unconnected.' }
    sx={ { width: '100%', color: 'text.secondary', overflow: 'visible' } }>
    { [high, (high + low) / 2, low].map((value, index) => <g key={ index }>
      <line x1="40" x2="388" y1={ vertical(value) } y2={ vertical(value) } stroke="currentColor" opacity="0.12" />
      <text x="0" y={ vertical(value) + 3 } fontSize="10" fill="currentColor">{ Math.round(value) }</text>
    </g>) }
    { plot.segments.map((segment, index) => <Box component="g" key={ index } sx={ { color: 'primary.main' } }>
      { segment.length > 1 ? <path
        d={ segment.map((point, position) => `${position ? 'L' : 'M'}${horizontal(point.seconds)},${vertical(point.value)}`).join(' ') }
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round" />
        : <circle cx={ horizontal(segment[0].seconds) } cy={ vertical(segment[0].value) } r="2.5" fill="currentColor" /> }
    </Box>) }
    <text x="40" y="151" fontSize="10" fill="currentColor">{ moment(detail.episode.startedAt).tz(detail.timeZone).format('MMM D HH:mm') }</text>
    <text x="388" y="151" textAnchor="end" fontSize="10" fill="currentColor">
      { moment(detail.episode.endedAt).tz(detail.timeZone).format('MMM D HH:mm') }
    </text>
  </Box>;
}
