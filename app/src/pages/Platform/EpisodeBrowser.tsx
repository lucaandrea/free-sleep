import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import moment from 'moment-timezone';
import axios from '@api/api';
import { errorMessage, type SleepAnalytics } from '@api/platform';
import type { EpisodeDetail } from '../../../../server/src/analytics/episode';
import Surface from './Surface';
import EpisodeDetailPanel from './EpisodeDetailPanel';
import SleepRecordActions from '@components/SleepRecordActions';

export default function EpisodeBrowser({ episodes, side, timeZone, initiallyExpanded = false }: {
  episodes: SleepAnalytics['episodes']; side: 'left' | 'right'; timeZone: string; initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const episodeLabel = useId();
  const ordered = [...episodes].sort((first, second) => second.endedAt.localeCompare(first.endedAt));
  const selected = ordered.find(episode => episode.id === selectedId) ?? ordered[0];
  const query = useQuery({
    queryKey: ['episode', side, selected?.id],
    enabled: expanded && !!selected,
    queryFn: async ({ signal }) => (await axios.get<EpisodeDetail>(`analytics/episodes/${selected.id}`, { params: { side }, signal })).data,
    retry: 1,
  });
  return <Surface
    title="Your recorded episodes"
    eyebrow="NIGHT BY NIGHT"
    action={
      <Button aria-expanded={ expanded } onClick={ () => setExpanded(value => !value) }>
        { expanded ? 'Hide details' : 'Browse episodes' }
      </Button>
    }>
    <Stack spacing={ 2.5 }>
      <Typography color="text.secondary">Includes shorter episodes. Times in { timeZone }.</Typography>
      { notice && <Typography role="status" color="success.main">{ notice }</Typography> }
      { expanded && (!selected ? <Typography>No episodes in this range.</Typography> : <>
        <Stack spacing={ 1 }>
          <Typography id={ episodeLabel } variant="body2" color="text.secondary">Recorded episode</Typography>
          <TextField
            select
            fullWidth
            slotProps={ { select: { labelId: episodeLabel } } }
            value={ selected.id }
            onChange={ event => setSelectedId(Number(event.target.value)) }>
            { ordered.map(episode => <MenuItem key={ episode.id } value={ episode.id }>
              { moment(episode.endedAt).tz(timeZone).format('MMM D, YYYY') } · { moment(episode.startedAt).tz(timeZone).format('HH:mm') }
            –{ moment(episode.endedAt).tz(timeZone).format('HH:mm') }
            </MenuItem>) }
          </TextField>
        </Stack>
        { query.isPending && <Typography role="status">Loading episode…</Typography> }
        { query.isError && <Alert severity="error" action={ <Button onClick={ () => query.refetch() }>Retry</Button> }>
          { errorMessage(query.error) }
        </Alert> }
        { query.data && !query.isError && <>
          <SleepRecordActions
            key={ `${side}:${selected.id}` }
            timeZone={ timeZone }
            onSaved={ setNotice }
            record={ {
              id: query.data.episode.id, side, entered_bed_at: query.data.episode.startedAt, left_bed_at: query.data.episode.endedAt,
            } } />
          <EpisodeDetailPanel key={ `${side}:${selected.id}` } detail={ query.data } />
        </> }
      </>) }
    </Stack>
  </Surface>;
}
