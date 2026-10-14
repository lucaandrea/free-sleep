import { design } from '../design/tokens';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Box, LinearProgress } from '@mui/material';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <Box id="Layout" sx={ { minHeight: '100dvh', bgcolor: 'background.default' } }>
      <Navbar/>
      <Box
        component="main"
        sx={ {
          ml: { md: `${design.layout.sidebarWidth}px` }, minWidth: 0, pt: 'env(safe-area-inset-top)',
          pb: { xs: 'calc(88px + env(safe-area-inset-bottom))', md: 5 },
        } }
      >
        <Suspense fallback={ <LinearProgress aria-label="Loading view" /> }><Outlet/></Suspense>
      </Box>
    </Box>
  );
}
