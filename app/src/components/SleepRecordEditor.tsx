import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { useQueryClient } from '@tanstack/react-query';
import moment from 'moment-timezone';
import { deleteSleepRecord, updateSleepRecord } from '@api/sleep';
import { errorMessage } from '@api/platform';
import { sleepRecordChange, sleepRecordIdentity } from '../../../server/src/records/sleepMutation';

export type RecordWindow = { id: number; side: string; entered_bed_at: string; left_bed_at: string };
export type RecordSelection = { record: RecordWindow; action: 'edit' | 'delete' };

// The dialog owns a snapshot: changing the selected episode cannot redirect an in-flight write.
export default function SleepRecordEditor({ selection: { record, action }, timeZone, close, saved }: {
  selection: RecordSelection; timeZone: string; close: () => void; saved: (message: string) => void;
}) {
  const cache = useQueryClient();
  const [start, setStart] = useState<moment.Moment | null>(() => moment(record.entered_bed_at).tz(timeZone));
  const [end, setEnd] = useState<moment.Moment | null>(() => moment(record.left_bed_at).tz(timeZone));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identity = { side: record.side, expected: { entered_bed_at: record.entered_bed_at, left_bed_at: record.left_bed_at } };
  const change = sleepRecordChange.safeParse({ ...identity, entered_bed_at: start?.toISOString(), left_bed_at: end?.toISOString() });
  const unchanged = start?.unix() === moment(record.entered_bed_at).unix() && end?.unix() === moment(record.left_bed_at).unix();
  const submit = async () => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      if (action === 'delete') await deleteSleepRecord(record.id, sleepRecordIdentity.parse(identity));
      else {
        if (!change.success || unchanged) return;
        await updateSleepRecord(record.id, change.data);
      }
      await Promise.all(['analytics', 'episode', 'useSleepRecords', 'journal'].map(key => cache.invalidateQueries({ queryKey: [key] })));
      saved(action === 'delete' ? 'Record deleted.' : 'Record updated.');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setSaving(false); }
  };
  const clock = (value: moment.Moment | null) => value?.isValid() ? value.format('MMM D, YYYY HH:mm z (Z)') : 'Choose a valid date';
  return <Dialog open onClose={ saving ? undefined : close } fullWidth maxWidth="sm" aria-labelledby="record-editor-title">
    <DialogTitle id="record-editor-title">{ action === 'edit' ? 'Edit record' : 'Delete this record?' }</DialogTitle>
    <DialogContent>
      <Stack spacing={ 2.5 } sx={ { pt: 1 } }>
        <Typography color="text.secondary">{ record.side === 'left' ? 'Left side' : 'Right side' } · { timeZone }</Typography>
        <Typography>{ action === 'edit'
          ? 'Correct the episode window. Original sensor intervals and vital readings stay unchanged.'
          : 'This removes the episode from Free Sleep history and analytics. Original vital readings remain. This cannot be undone.' }
        </Typography>
        { action === 'edit' ? <>
          <DateTimePicker
            label="Entered bed"
            value={ start }
            onChange={ setStart }
            timezone={ timeZone }
            ampm={ false }
            disabled={ saving }
            slotProps={ { textField: { fullWidth: true } } } />
          <Typography variant="caption" color="text.secondary">{ clock(start) }</Typography>
          <DateTimePicker
            label="Left bed"
            value={ end }
            onChange={ setEnd }
            timezone={ timeZone }
            ampm={ false }
            disabled={ saving }
            slotProps={ { textField: { fullWidth: true } } } />
          <Typography variant="caption" color="text.secondary">{ clock(end) }</Typography>
          { !change.success && <Alert severity="info">Choose an end after the start, within a 72-hour window.</Alert> }
        </> : <Typography>{ clock(start) } — { clock(end) }</Typography> }
        <Typography variant="caption" color="text.secondary">
          Health sync reconciles previous Apple Health exports within its sync window.
        </Typography>
        { error && <Alert severity="error">{ error }</Alert> }
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button disabled={ saving } onClick={ close }>Cancel</Button>
      <Button
        variant={ action === 'delete' ? 'outlined' : 'contained' }
        color={ action === 'delete' ? 'error' : 'primary' }
        disabled={ saving || (action === 'edit' && (!change.success || unchanged)) }
        onClick={ submit }>{ saving ? 'Saving…' : action === 'edit' ? 'Save changes' : 'Delete record' }</Button>
    </DialogActions>
  </Dialog>;
}
