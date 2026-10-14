import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment-timezone';
import { changeAlarm } from '@api/alarm';
import { errorMessage } from '@api/platform';
import type { AlarmChange, AlarmPreview } from '../../../../server/src/alarms/types';

export interface AlarmEdit { action: AlarmChange['action']; preview: AlarmPreview }

export default function AlarmEditor({ edit, onClose }: { edit: AlarmEdit; onClose: () => void }) {
  const { preview, action } = edit;
  const [time, setTime] = useState(preview.alarm?.time ?? '07:00');
  const queries = useQueryClient();
  const change = useMutation({
    mutationFn: (input: AlarmChange) => changeAlarm(input),
    onSuccess: result => { queries.setQueryData(['alarm', preview.side], result); onClose(); },
    onSettled: () => {
      void queries.invalidateQueries({ queryKey: ['alarm', preview.side] });
      void queries.invalidateQueries({ queryKey: ['useSettings'] });
    },
  });
  const save = () => {
    if (action === 'restore' && preview.expiresAt) change.mutate({ side: preview.side, action,
      expectedExpiresAt: preview.expiresAt, ...(preview.overrideRevision ? { expectedRevision: preview.overrideRevision } : {}) });
    else if (preview.alarm && action === 'time') change.mutate({ side: preview.side, action, time, expectedAt: preview.alarm.at });
    else if (preview.alarm && action === 'disable') change.mutate({ side: preview.side, action, expectedAt: preview.alarm.at });
  };
  const title = action === 'time' ? 'Change this alarm' : action === 'disable' ? 'Skip this alarm?' : 'Use your routine?';
  const explanation = action === 'time' ? 'Only this alarm changes. Choose a future time on the displayed date.'
    : action === 'disable' ? 'Skip this occurrence. Your saved routine stays the same.'
      : 'Remove the one-time change and return to your saved routine.';
  const invalidTime = action === 'time' && (!time || time === preview.alarm?.time);
  return <Dialog open onClose={ change.isPending ? undefined : onClose } fullWidth maxWidth="xs" aria-labelledby="alarm-editor-title">
    <DialogTitle id="alarm-editor-title">{ title }</DialogTitle>
    <DialogContent><Stack spacing={ 2 } sx={ { pt: 1 } }>
      <Typography variant="body2" color="text.secondary">
        { preview.side === 'left' ? 'Left side' : 'Right side' } · { preview.timeZone }
      </Typography>
      { preview.alarm && <Typography>{ moment.tz(preview.alarm.at, preview.timeZone).format('ddd, MMM D · h:mm A') }</Typography> }
      <Typography variant="body2">{ explanation }</Typography>
      { action === 'time' && <TextField
        label="Alarm time"
        type="time"
        value={ time }
        onChange={ event => setTime(event.target.value) }
        disabled={ change.isPending }
        slotProps={ { inputLabel: { shrink: true } } }
      /> }
      { change.isError && <Alert severity="error">{ errorMessage(change.error) }</Alert> }
    </Stack></DialogContent>
    <DialogActions sx={ { p: 2.5, pt: 1 } }><Button onClick={ onClose } disabled={ change.isPending }>Cancel</Button>
      <Button variant="contained" onClick={ save } disabled={ change.isPending || invalidTime }>
        { change.isPending ? 'Saving…' : action === 'time' ? 'Save time' : action === 'disable' ? 'Skip once' : 'Use routine' }
      </Button></DialogActions>
  </Dialog>;
}
