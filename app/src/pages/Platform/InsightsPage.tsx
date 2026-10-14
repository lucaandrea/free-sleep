import { Alert, Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@state/appStore';
import { durationLabel, useAnalytics } from '@api/platform';
import PageContainer from '../PageContainer';
import PageHeader from '@components/PageHeader';
import SideControl from '@components/SideControl';
import Surface from './Surface';
import JournalCard from './JournalCard';
import EpisodeBrowser from './EpisodeBrowser';
import DataCoverageCard from './DataCoverageCard';

export default function InsightsPage() {
  const { side } = useAppStore();
  const [days, setDays] = useState(30);
  const analytics = useAnalytics(side, days);
  const summary = analytics.data?.summary;
  const nights = analytics.data?.nights || [];
  return (
    <PageContainer>
      <PageHeader title="Understand your nights.">
        <Chip label="Local analytics" color="success" />
      </PageHeader>
      <Typography color="text.secondary" sx={ { mt: -1.5 } }>
        Notice your patterns. Find a rhythm that feels like you.
      </Typography>
      <Stack direction={ { xs: 'column', sm: 'row' } } spacing={ 2 } sx={ { justifyContent: 'space-between' } }>
        <Box sx={ { width: { xs: '100%', sm: 320 } } }>
          <SideControl />
        </Box>
        <ToggleButtonGroup
          value={ days }
          exclusive
          onChange={ (_, value: number | null) => {
            if (value) setDays(value);
          } }
        >
          { [7, 30, 90].map((value) => (
            <ToggleButton key={ value } value={ value }>
              { value } days
            </ToggleButton>
          )) }
        </ToggleButtonGroup>
      </Stack>
      { analytics.isError && (
        <Alert severity="error" action={ <Button onClick={ () => analytics.refetch() }>Retry</Button> }>
          Sleep analytics are unavailable. Check the Pod connection.
        </Alert>
      ) }
      <Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 } }>
        { [
          { title: 'Bed presence', value: durationLabel(summary?.averageOccupiedMinutes), caption: 'Recent recorded nights' },
          {
            title: 'Bedtime variation',
            value: summary?.bedtimeVariationMinutes == null ? '—' : `${summary.bedtimeVariationMinutes} min`,
            caption: 'Lower means more consistent',
          },
          {
            title: 'Heart rate',
            value: summary?.averageHeartRate == null ? '—' : `${summary.averageHeartRate} bpm`,
            caption: 'During detected presence',
          },
          { title: 'Recorded nights', value: summary?.recordedNights ?? '—', caption: 'Missing nights are not zero' },
        ].map((metric) => (
          <Surface key={ metric.title } title={ metric.title }>
            <Typography variant="h2">{ metric.value }</Typography>
            <Typography color="text.secondary" variant="caption">
              { metric.caption }
            </Typography>
          </Surface>
        )) }
      </Box>
      { analytics.data && <DataCoverageCard
        key={ `coverage:${side}:${days}` }
        report={ analytics.data.quality?.coverage }
        timeZone={ analytics.data.timeZone }
      /> }
      <Surface title="Time made for rest" eyebrow="BED PRESENCE">
        { nights.length ? (
          <Box sx={ { display: 'flex', alignItems: 'flex-end', gap: 0.75, height: 170, overflowX: 'auto', pb: 2 } }>
            { nights.map((night) => (
              <Box
                key={ night.id }
                title={ `${night.date}: ${durationLabel(night.occupiedMinutes)}` }
                role="img"
                aria-label={ `${night.date}: ${durationLabel(night.occupiedMinutes)} bed presence` }
                sx={ {
                  flex: 1,
                  minWidth: 8,
                  maxWidth: 55,
                  height:
                    night.occupiedMinutes == null ? 4 : `${Math.max(3, Math.min(100, (night.occupiedMinutes / 720) * 100))}%`,
                  bgcolor: night.occupiedMinutes == null ? 'divider' : 'primary.main',
                  opacity: 0.7,
                  borderRadius: '6px 6px 2px 2px',
                } }
              />
            )) }
          </Box>
        ) : (
          <Box sx={ { py: 5, textAlign: 'center' } }>
            <Typography>No nights recorded yet</Typography>
            <Typography color="text.secondary">Enable biometrics on your Pod to start building your history.</Typography>
          </Box>
        ) }
        <Typography variant="caption" color="text.secondary">
          Longest episode per wake date · { analytics.data?.timeZone || 'Pod timezone' }
        </Typography>
      </Surface>
      <EpisodeBrowser
        key={ `${side}:${days}` }
        side={ side }
        episodes={ analytics.data?.episodes ?? [] }
        timeZone={ analytics.data?.timeZone ?? 'UTC' } />
      <JournalCard key={ side } side={ side } days={ days } />
      <Surface
        title="Beyond the headline"
      >
        <Stack spacing={ 1.5 }>
          <Typography>
            HRV estimate: { summary?.averageHrv ?? '—' } ms · breathing estimate: { summary?.averageRespiratoryRate ?? '—' } / min
          </Typography>
          <Typography color="text.secondary">
            These estimates are experimental. Bed presence does not establish sleep stages or sleep quality.
          </Typography>
          <Button component={ Link } to="/data/sleep" variant="outlined" sx={ { alignSelf: 'flex-start' } }>
            Manage recorded episodes
          </Button>
        </Stack>
      </Surface>
    </PageContainer>
  );
}
