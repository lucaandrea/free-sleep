import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import PageContainer from '../PageContainer';
import PageHeader from '@components/PageHeader';
import FormField from '@components/FormField';
import Surface from './Surface';
import ConnectionCard from './ConnectionCard';
import HomeConnectionCard from './HomeConnectionCard';

export default function ConnectionsPage() {
  return <PageContainer sx={ { maxWidth: 800 } }>
    <PageHeader title="Make it yours." />
    <ConnectionCard />
    <Surface title="Appearance" eyebrow="YOUR SPACE">
      <FormField title="Color theme">
        <TextField
          select
          defaultValue={ localStorage.getItem('freeSleepAppearance') || 'light' }
          slotProps={ { select: { inputProps: { 'aria-label': 'Color theme' } } } }
          onChange={ event => { localStorage.setItem('freeSleepAppearance', event.target.value); window.location.reload(); } }>
          <MenuItem value="light">Warm daylight</MenuItem><MenuItem value="dark">Quiet night</MenuItem>
        </TextField>
      </FormField>
    </Surface>
    <HomeConnectionCard />
    <Surface title="Apple Health" eyebrow="YOUR HEALTH, YOUR CHOICE">
      <Typography color="text.secondary">
        Link your own bed side to Health in the native iPhone app. Bed presence is saved as time in bed,
        with optional Pod heart rate. Health comparisons stay on your iPhone.
      </Typography>
    </Surface>
    <Surface title="Shortcuts & Siri" eyebrow="EVERYDAY ACTIONS">
      <Typography color="text.secondary">
        Find Free Sleep in Shortcuts on your iPhone to control temperature, power, bed position, adaptive comfort and Away mode;
        change or skip your next alarm, sync Health, or read your latest summary.
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={ { display: 'block', mt: 2 } }>
        Bed movement affects both sides. Your iPhone must be able to reach the Pod or your secure gateway.
      </Typography>
    </Surface>
    <Surface title="Fine-tune your setup">
      <Stack direction="row" sx={ { flexWrap: 'wrap', gap: 1 } }>
        <Button component={ Link } to="/settings/device" variant="outlined">Device settings</Button>
        <Button component={ Link } to="/status" variant="outlined">System health</Button>
        <Button component={ Link } to="/data/logs" variant="outlined">Logs</Button>
      </Stack>
    </Surface>
  </PageContainer>;
}
