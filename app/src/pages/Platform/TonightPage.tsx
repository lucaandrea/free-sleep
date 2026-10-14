import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useAppStore } from '@state/appStore';
import { durationLabel, useAnalytics } from '@api/platform';
import PageContainer from '../PageContainer';
import PageHeader from '@components/PageHeader';
import SideControl from '@components/SideControl';
import ConnectionBadge from '@components/ConnectionBadge';
import TemperatureCard from './TemperatureCard';
import BaseCard from './BaseCard';
import Surface from './Surface';
import PodNotifications from './PodNotifications';
import ComfortCard from './ComfortCard';

export default function TonightPage() {
  const { side } = useAppStore();
  const analytics = useAnalytics(side);
  const last = analytics.data?.nights[analytics.data.nights.length - 1];
  return (
    <PageContainer>
      <PageHeader title="Make room for rest.">
        <ConnectionBadge />
      </PageHeader>
      <Typography color="text.secondary" sx={ { mt: -1.5 } }>
        Your bed, your rhythm. A little more comfortable tonight.
      </Typography>
      <Box sx={ { maxWidth: 350 } }>
        <SideControl />
      </Box>
      <PodNotifications />
      <Box sx={ { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, alignItems: 'start' } }>
        <TemperatureCard key={ side } side={ side } />
        <BaseCard />
      </Box>
      <ComfortCard key={ `comfort-${side}` } side={ side } />
      <Surface
        title="A glance at last night"
        eyebrow="YOUR ROUTINE"
        action={
          <Button component={ Link } to="/insights">
            Explore sleep →
          </Button>
        }
      >
        <Box sx={ { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 } }>
          { [
            { label: 'Bed presence', value: durationLabel(last?.occupiedMinutes) },
            { label: 'Heart rate', value: last?.heartRate == null ? '—' : `${last.heartRate} bpm` },
            { label: 'Bed exits', value: last?.exits ?? '—' },
          ].map((metric) => (
            <Box key={ metric.label }>
              <Typography color="text.secondary" variant="caption">
                { metric.label }
              </Typography>
              <Typography variant="h3" sx={ { mt: 1, fontSize: { xs: 22, sm: 28 } } }>
                { metric.value }
              </Typography>
            </Box>
          )) }
        </Box>
        <Typography color="text.secondary" variant="caption" component="p" sx={ { mt: 2 } }>
          { analytics.isError
            ? 'Sleep records are unavailable. Check your Pod connection in Settings.'
            : last
              ? 'Based on Pod presence and vitals. Presence is not measured sleep.'
              : 'Your first recorded night will appear here.' }
        </Typography>
      </Surface>
    </PageContainer>
  );
}
