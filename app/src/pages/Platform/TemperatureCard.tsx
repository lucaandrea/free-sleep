import { design } from '../../design/tokens';
import { useState } from 'react';
import { Alert, Box, Button, Slider, Typography, Chip } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import { postDeviceStatus, useDeviceStatus } from '@api/deviceStatus';
import { useSettings } from '@api/settings';
import { errorMessage } from '@api/platform';
import Surface from './Surface';

export default function TemperatureCard({ side }: { side: 'left' | 'right' }) {
  const device = useDeviceStatus();
  const { data: settings } = useSettings();
  const queries = useQueryClient();
  const [draft, setDraft] = useState<number | null>(null);
  const status = device.data?.[side];
  const celsius = settings?.temperatureFormat === 'celsius';
  const display = (temperature: number) => (celsius ? Math.round(((temperature - 32) * 5) / 9) : Math.round(temperature));
  const mutation = useMutation({
    mutationFn: (update: { isOn?: boolean; targetTemperatureF?: number }) => postDeviceStatus({ [side]: update }),
    onSuccess: async () => {
      await queries.invalidateQueries({ queryKey: ['useDeviceStatus'] });
      setDraft(null);
    },
  });
  const unavailable = !status || device.isError || Boolean(settings?.[side]?.awayMode);
  const target = draft ?? status?.targetTemperatureF ?? 80;
  return (
    <Surface
      title="Your side of comfort"
      eyebrow="TEMPERATURE"
      action={
        <Chip
          label={ unavailable ? 'Offline' : status.isOn ? 'On' : 'Off' }
          color={ status?.isOn && !unavailable ? 'success' : 'default' }
        />
      }
    >
      <Box sx={ { py: 2, textAlign: 'center' } }>
        <Typography sx={ { fontSize: design.type.temperature, lineHeight: 1.1, letterSpacing: '-0.07em', fontWeight: 500 } }>
          { unavailable ? '—' : display(target) }
          <Box component="span" sx={ { fontSize: design.type.temperatureUnit, color: 'text.secondary' } }>
            °{ celsius ? 'C' : 'F' }
          </Box>
        </Typography>
        <Typography color="text.secondary" sx={ { mt: 1 } }>
          { unavailable ? 'Connect your Pod to set a temperature' : `Target · currently ${display(status.currentTemperatureF)}°` }
        </Typography>
      </Box>
      <Slider
        aria-label="Target bed temperature"
        min={ 55 }
        max={ 110 }
        value={ target }
        disabled={ unavailable || mutation.isPending }
        onChange={ (_, value) => setDraft(value as number) }
        valueLabelDisplay="auto"
        valueLabelFormat={ (value) => `${display(value)}°` }
        sx={ { mt: 2 } }
      />
      <Box sx={ { display: 'flex', justifyContent: 'space-between', color: 'text.secondary', mb: 3 } }>
        <Typography variant="caption">Cool · { display(55) }°</Typography>
        <Typography variant="caption">Warm · { display(110) }°</Typography>
      </Box>
      <Box sx={ { display: 'flex', gap: 1 } }>
        <Button
          variant="outlined"
          startIcon={ <PowerSettingsNewIcon /> }
          disabled={ unavailable || mutation.isPending }
          onClick={ () => mutation.mutate({ isOn: !status?.isOn }) }
        >
          { status?.isOn ? 'Turn off' : 'Turn on' }
        </Button>
        <Button
          variant="contained"
          sx={ { flex: 1 } }
          disabled={ unavailable || draft === null || mutation.isPending }
          onClick={ () => mutation.mutate({ targetTemperatureF: target }) }
        >
          Set temperature
        </Button>
      </Box>
      { mutation.isError && (
        <Alert severity="error" sx={ { mt: 2 } }>
          { errorMessage(mutation.error) }
        </Alert>
      ) }
    </Surface>
  );
}
