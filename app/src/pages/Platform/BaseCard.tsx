import { design } from '../../design/tokens';
import { useState } from 'react';
import { Alert, Box, Button, Chip, Slider, Stack, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import axios from '@api/api';
import { errorMessage, useBase } from '@api/platform';
import Surface from './Surface';

const presets = [
  { name: 'Flat', head: 0, feet: 0 },
  { name: 'Sleep', head: 1, feet: 5 },
  { name: 'Relax', head: 30, feet: 15 },
  { name: 'Read', head: 40, feet: 0 },
];

export default function BaseCard() {
  const base = useBase();
  const [head, setHead] = useState(0);
  const [feet, setFeet] = useState(0);
  const mutation = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: object }) => axios.post(`base/${action}`, body),
    onSettled: () => base.refetch(),
  });
  // Stop has its own request state so it stays available while a move is pending.
  const stop = useMutation({ mutationFn: () => axios.post('base/stop'), onSettled: () => base.refetch() });
  const connected = base.data?.state === 'connected' && !base.isError;
  const ready = connected && !base.data?.stale && !base.data?.busy && !mutation.isPending;
  const headRise = Math.sin((head * Math.PI) / 180) * 90;
  const feetRise = Math.sin((feet * Math.PI) / 180) * 70;
  return (
    <Surface title="Find your position" eyebrow="POD ULTRA BASE" action={ <Chip label="Experimental" /> }>
      <Box
        sx={ {
          '--bed-line': (theme) => design.colors.bedLine[theme.palette.mode],
          bgcolor: 'background.default', borderRadius: '12px', px: 2, py: 1, mb: 2,
        } }>
        <svg
          viewBox="0 0 320 140"
          width="100%"
          height="140"
          role="img"
          aria-label={ `Position preview: head ${head} degrees, feet ${feet} degrees` }
        >
          <path
            d="M35 114H285M60 114V128M260 114V128"
            fill="none"
            stroke="currentColor"
            opacity=".16"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d={ `M40 ${98 - headRise} L130 98 H185 L245 ${98 - feetRise} L284 ${98 - feetRise * 0.5}` }
            fill="none"
            stroke="currentColor"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity=".12"
          />
          <path
            d={ `M40 ${91 - headRise} L130 91 H185 L245 ${91 - feetRise} L284 ${91 - feetRise * 0.5}` }
            fill="none"
            stroke="var(--bed-line)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <Typography sx={ { textAlign: 'center' } } variant="caption" color="text.secondary" component="p">
          Position preview · moves the whole bed
        </Typography>
      </Box>
      <Stack direction="row" spacing={ 1 } sx={ { mb: 2 } }>
        { presets.map((preset) => (
          <Button
            key={ preset.name }
            variant={ head === preset.head && feet === preset.feet ? 'contained' : 'outlined' }
            sx={ { flex: 1, minWidth: 0, px: 1 } }
            onClick={ () => {
              setHead(preset.head);
              setFeet(preset.feet);
            } }
          >
            { preset.name }
          </Button>
        )) }
      </Stack>
      { [
        { name: 'Head', value: head, setter: setHead, max: 60 },
        { name: 'Feet', value: feet, setter: setFeet, max: 45 },
      ].map((axis) => (
        <Box key={ axis.name } sx={ { px: 1 } }>
          <Box sx={ { display: 'flex', justifyContent: 'space-between' } }>
            <Typography>{ axis.name }</Typography>
            <Typography>{ axis.value }°</Typography>
          </Box>
          <Slider
            aria-label={ `${axis.name} angle preview` }
            value={ axis.value }
            min={ 0 }
            max={ axis.max }
            onChange={ (_, value) => axis.setter(value as number) }
          />
        </Box>
      )) }
      <Typography color="text.secondary" variant="caption" component="p" sx={ { mb: 2 } }>
        { connected && !base.data?.stale && base.data?.position
          ? `Reported · head ${base.data.position.left.head}° / ${base.data.position.right.head}°`
            + ` · feet ${base.data.position.left.feet}° / ${base.data.position.right.feet}°`
          : 'Live position unavailable. Connect the base before moving.' }
      </Typography>
      <Stack direction="row" spacing={ 1 }>
        { connected ? (
          <Button
            variant="contained"
            fullWidth
            disabled={ !ready }
            onClick={ () => mutation.mutate({ action: 'position', body: { head, feet, speed: 50 } }) }
          >
            Move bed
          </Button>
        ) : (
          <Button
            variant="contained"
            fullWidth
            disabled={ mutation.isPending }
            onClick={ () => mutation.mutate({ action: 'connect' }) }
          >
            Connect base
          </Button>
        ) }
        <Button variant="outlined" color="error" disabled={ !connected || stop.isPending } onClick={ () => stop.mutate() }>
          Stop
        </Button>
      </Stack>
      { (mutation.isError || stop.isError) && (
        <Alert severity="error" sx={ { mt: 2 } }>
          { errorMessage(stop.error || mutation.error) }
        </Alert>
      ) }
    </Surface>
  );
}
