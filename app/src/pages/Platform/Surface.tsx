import { design } from '../../design/tokens';
import { Box, Paper, Typography } from '@mui/material';
import type { PropsWithChildren, ReactNode } from 'react';
export default function Surface({
  title,
  eyebrow,
  action,
  children,
}: PropsWithChildren<{
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}>) {
  return (
    <Paper sx={ { p: `${design.layout.cardInset}px`, borderRadius: `${design.layout.cardRadius}px`, minWidth: 0 } }>
      <Box sx={ { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2.5, flexWrap: 'wrap' } }>
        <Box>
          { eyebrow && (
            <Typography variant="overline" color="text.secondary">
              { eyebrow }
            </Typography>
          ) }
          <Typography variant="h4" component="h2">
            { title }
          </Typography>
        </Box>
        { action }
      </Box>
      { children }
    </Paper>
  );
}
