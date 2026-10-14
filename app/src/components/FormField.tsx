import type { ReactNode } from 'react';
import { Stack, Typography } from '@mui/material';

export default function FormField({ title, children }: { title: string; children: ReactNode }) {
  return <Stack spacing={ 1 }>
    <Typography variant="body2" color="text.secondary">{ title }</Typography>
    { children }
  </Stack>;
}
