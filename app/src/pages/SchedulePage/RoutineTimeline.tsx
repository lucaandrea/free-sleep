import { Box, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { DailySchedule } from '@api/schedulesSchema';
import { minutesAfter, routinePoints } from '../../../../server/src/routines/contract';
import { formatTemperature } from '@lib/temperatureConversions';

export default function RoutineTimeline({ schedule, celsius }: { schedule: DailySchedule; celsius: boolean }) {
  const theme = useTheme();
  const points = routinePoints(schedule);
  if (!points.length)
    return (
      <Typography color="text.secondary">Choose different turn-on and turn-off times to preview your night.</Typography>
    );
  const duration = points[points.length - 1].minutes;
  const horizontal = (minutes: number) => 38 + (minutes / duration) * 330;
  const vertical = (temperature: number) => 112 - ((temperature - 55) / 55) * 88;
  const path = points
    .map((point, index) =>
      index === 0
        ? `M${horizontal(point.minutes)},${vertical(point.temperature)}`
        : `H${horizontal(point.minutes)}V${vertical(point.temperature)}`,
    )
    .join(' ');
  const alarm = minutesAfter(schedule.alarm.time, schedule.power.on);
  const summary = points
    .slice(0, -1)
    .map((point) => `${point.time}: ${formatTemperature(point.temperature, celsius)}`)
    .join('; ');
  return (
    <Stack spacing={ 1 }>
      <Box
        component="svg"
        viewBox="0 0 400 142"
        role="img"
        aria-label={ `Planned temperature. ${summary}. Off at ${schedule.power.off}.` }
        sx={ { width: '100%', display: 'block', opacity: schedule.power.enabled ? 1 : 0.45 } }
      >
        { [55, 80, 110].map((temperature) => (
          <g key={ temperature }>
            <line
              x1="38"
              x2="368"
              y1={ vertical(temperature) }
              y2={ vertical(temperature) }
              stroke={ theme.palette.divider }
            />
            <text x="0" y={ vertical(temperature) + 4 } fill={ theme.palette.text.secondary } fontSize="11">
              { formatTemperature(temperature, celsius) }
            </text>
          </g>
        )) }
        <path d={ path } fill="none" stroke={ theme.palette.primary.main } strokeWidth="3" strokeLinejoin="round" />
        { schedule.alarm.enabled && alarm > 0 && alarm < duration && (
          <line
            x1={ horizontal(alarm) }
            x2={ horizontal(alarm) }
            y1="20"
            y2="114"
            stroke={ theme.palette.text.secondary }
            strokeDasharray="3 4"
          />
        ) }
        <text x="38" y="138" fill={ theme.palette.text.secondary } fontSize="12">
          { schedule.power.on }
        </text>
        <text x="368" y="138" textAnchor="end" fill={ theme.palette.text.secondary } fontSize="12">
          { schedule.power.off }
          { schedule.power.off < schedule.power.on ? ' +1 day' : '' }
        </text>
      </Box>
      <Typography variant="caption" color="text.secondary">
        { schedule.power.enabled
          ? 'Planned targets · actual temperature changes gradually.'
          : 'Routine off · this plan runs when enabled.' }
        { schedule.alarm.enabled && ` Vibration at ${schedule.alarm.time}.` }
      </Typography>
    </Stack>
  );
}
