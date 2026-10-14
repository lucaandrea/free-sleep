import { design } from '../design/tokens';
import { PropsWithChildren } from 'react';
import { Alert, Container, ContainerProps, SxProps, Theme } from '@mui/material';
import ErrorBoundary from '@components/ErrorBoundary.tsx';

type PageContainerProps = { containerProps?: ContainerProps; sx?: SxProps<Theme> };

export default function PageContainer({ children, sx = [], containerProps }: PropsWithChildren<PageContainerProps>) {
  return (
    <ErrorBoundary componentName="Page container">
      <Container
        { ...containerProps }
        id="PageContainer"
        maxWidth={ false }
        sx={ [
          { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: `${design.layout.gap}px`,
            width: '100%', maxWidth: design.layout.pageWidth, mx: 'auto',
            px: { xs: `${design.layout.pageInset}px`, md: `${design.layout.widePageInset}px` },
            py: { xs: `${design.layout.pageTop}px`, md: `${design.layout.widePageInset}px` } },
          ...(Array.isArray(sx) ? sx : [sx]),
        ] }
      >
        { import.meta.env.VITE_ENV === 'demo' && <Alert severity="info">Demo · sample data and simulated controls</Alert> }
        { children }
      </Container>
    </ErrorBoundary>
  );
}
