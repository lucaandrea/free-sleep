import { useState } from 'react';
import { Alert, Button, ToggleButton, ToggleButtonGroup } from '@mui/material';
import PageHeader from '@components/PageHeader';
import SideControl from '@components/SideControl';
import { useAppStore } from '@state/appStore';
import { useAnalytics } from '@api/platform';
import PageContainer from '../../PageContainer.tsx';
import EpisodeBrowser from '../../Platform/EpisodeBrowser';

export default function VitalsPage() {
  const { side } = useAppStore();
  const [days, setDays] = useState(30);
  const analytics = useAnalytics(side, days);
  return (
    <PageContainer>
      <PageHeader title="Your recorded vitals." />
      <SideControl />
      <ToggleButtonGroup
        exclusive
        value={ days }
        aria-label="History range"
        onChange={ (_, value: number | null) => { if (value) setDays(value); } }>
        { [7, 30, 90].map(value => <ToggleButton key={ value } value={ value }>{ value } days</ToggleButton>) }
      </ToggleButtonGroup>
      { analytics.isError && <Alert severity="error" action={ <Button onClick={ () => analytics.refetch() }>Retry</Button> }>
        Unable to load recorded episodes.
      </Alert> }
      <EpisodeBrowser
        key={ `${side}:${days}` }
        side={ side }
        episodes={ analytics.data?.episodes ?? [] }
        timeZone={ analytics.data?.timeZone ?? 'UTC' }
        initiallyExpanded />
    </PageContainer>
  );
}
