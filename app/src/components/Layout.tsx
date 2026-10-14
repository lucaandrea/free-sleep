import { design } from '../design/tokens';
import { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Box, LinearProgress } from '@mui/material';
import Navbar from './Navbar';
import { useRoutineDrafts } from '../pages/SchedulePage/routineDrafts';

export default function Layout() {
  const hasRoutineDrafts = useRoutineDrafts(state => Object.keys(state.drafts).length > 0);
  useEffect(() => {
    if (!hasRoutineDrafts) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasRoutineDrafts]);
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
