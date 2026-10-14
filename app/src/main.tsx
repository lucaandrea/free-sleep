import { initSentry } from './sentry.tsx';
initSentry();
import * as Sentry from '@sentry/react';

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from './theme';

const ControlTempPage = lazy(() => import('./pages/ControlTempPage/ControlTempPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage/SettingsPage'));
import Layout from './components/Layout';
import { AppStoreProvider } from '@state/appStore.tsx';
const SchedulePage = lazy(() => import('./pages/SchedulePage/SchedulePage.tsx'));
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { GlobalStyles } from '@mui/material';
const SleepPage = lazy(() => import('./pages/DataPage/SleepPage/SleepPage.tsx'));
const DataPage = lazy(() => import('./pages/DataPage/DataPage.tsx'));
const VitalsPage = lazy(() => import('./pages/DataPage/VitalsPage/VitalsPage.tsx'));
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
const LogsPage = lazy(() => import('./pages/DataPage/LogsPage/LogsPage.tsx'));
const StatusPage = lazy(() => import('./pages/StatusPage/StatusPage.tsx'));

const TonightPage = lazy(() => import('./pages/Platform/TonightPage'));
const InsightsPage = lazy(() => import('./pages/Platform/InsightsPage'));
const CoachPage = lazy(() => import('./pages/Platform/CoachPage'));
const ConnectionsPage = lazy(() => import('./pages/Platform/ConnectionsPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
    },
  },
});

const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);


const App = () => {
  return (

    <QueryClientProvider client={ queryClient }>
      <ThemeProvider theme={ theme }>
        <LocalizationProvider dateAdapter={ AdapterMoment }>

          <AppStoreProvider>
            <CssBaseline/>
            <GlobalStyles
              styles={ {
                'html, body': {
                  overscrollBehavior: 'none', // Prevent rubber-banding
                },
              } }
            />
            <BrowserRouter basename="/">
              <SentryRoutes>
                <Route path="/" element={ <Layout/> }>
                  <Route index element={ <TonightPage/> }/>
                  <Route path="insights" element={ <InsightsPage/> }/>
                  <Route path="coach" element={ <CoachPage/> }/>
                  <Route path="temperature" element={ <ControlTempPage/> }/>
                  <Route path="left" element={ <ControlTempPage/> }/>
                  <Route path="right" element={ <ControlTempPage/> }/>
                  <Route path="status" element={ <StatusPage /> } />

                  <Route path="data" element={ <DataPage /> }>
                    <Route path="sleep" element={ <SleepPage/> }/>
                    <Route path="logs" element={ <LogsPage/> }/>
                    <Route path="vitals" element={ <VitalsPage/> }/>
                  </Route>

                  <Route path="settings" element={ <ConnectionsPage/> }/>
                  <Route path="settings/device" element={ <SettingsPage/> }/>
                  <Route path="schedules" element={ <SchedulePage/> }/>
                </Route>
              </SentryRoutes>
            </BrowserRouter>
          </AppStoreProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};


async function enableMocking() {
  if (import.meta.env.VITE_ENV !== 'demo') {
    return;
  }
  // eslint-disable-next-line no-console
  console.info('Enabling MSW worker!');

  const { worker } = await import('./mocks/browser');

  // `worker.start()` returns a Promise that resolves
  // once the Service Worker is up and ready to intercept requests.
  return worker.start();
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary componentName='App'>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
});
