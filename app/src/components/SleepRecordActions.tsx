import { useState } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import SleepRecordEditor, { type RecordSelection, type RecordWindow } from './SleepRecordEditor';

export default function SleepRecordActions({ record, timeZone, onSaved }: {
  record: RecordWindow; timeZone: string; onSaved?: (message: string) => void;
}) {
  const [selection, setSelection] = useState<RecordSelection | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return <Stack spacing={ 1 }>
    <Stack direction="row" spacing={ 1 } useFlexGap sx={ { flexWrap: 'wrap' } }>
      <Button variant="outlined" onClick={ () => { setNotice(null); setSelection({ record: { ...record }, action: 'edit' }); } }>
        Edit record
      </Button>
      <Button color="error" onClick={ () => { setNotice(null); setSelection({ record: { ...record }, action: 'delete' }); } }>
        Delete record
      </Button>
    </Stack>
    { notice && !onSaved && <Typography role="status" color="text.secondary">{ notice }</Typography> }
    { selection && <SleepRecordEditor
      selection={ selection }
      timeZone={ timeZone }
      close={ () => setSelection(null) }
      saved={ message => { setNotice(message); setSelection(null); onSaved?.(message); } } /> }
  </Stack>;
}
