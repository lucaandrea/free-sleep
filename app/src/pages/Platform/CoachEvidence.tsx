import { Box, Stack, Typography } from '@mui/material';
import type { CoachGrounding } from '../../../../server/src/ai/facts';

export default function CoachEvidence({ grounding }: { grounding?: CoachGrounding }) {
  if (grounding?.version !== 1) return <Typography variant="caption" color="text.secondary">
    Update your Free Sleep server to see how these observations were calculated.
  </Typography>;
  return <Box component="details">
    <Box component="summary" sx={ { cursor: 'pointer', color: 'primary.main', minHeight: 44, py: 1.5 } }>
      How these were calculated
    </Box>
    <Stack spacing={ 2 } sx={ { mt: 1 } }>
      { grounding.facts.map(fact => <Stack key={ fact.id } spacing={ 0.75 }>
        <Typography variant="h5" component="h3">{ fact.title }</Typography>
        <Typography variant="caption" color="text.secondary">{ fact.context }</Typography>
        <Typography variant="body2">{ fact.sample }</Typography>
        <Typography variant="body2" color="text.secondary">{ fact.calculation }</Typography>
      </Stack>) }
    </Stack>
  </Box>;
}
