import { design } from './design/tokens';
import { PaletteMode, alpha, createTheme, type Theme, type ThemeOptions } from '@mui/material/styles';

const typography: ThemeOptions['typography'] = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSize: 14,
  h1: { fontSize: '2.25rem', fontWeight: 600, letterSpacing: '-0.045em' },
  h2: { fontSize: design.type.widePageTitle, fontWeight: 600, letterSpacing: '-0.04em' },
  h3: { fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.035em' },
  h4: { fontSize: design.type.cardTitle, fontWeight: 600, letterSpacing: '-0.025em' },
  h5: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.02em' },
  h6: { fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.015em' },
  body1: { fontSize: design.type.body, lineHeight: 1.65 },
  body2: { fontSize: design.type.small, lineHeight: 1.6 },
  button: { fontSize: design.type.button, fontWeight: 500, textTransform: 'none' },
  caption: { fontSize: design.type.caption, lineHeight: 1.5 },
  overline: { fontSize: design.type.eyebrow, fontWeight: 600, letterSpacing: '0.12em', lineHeight: 2 },
};

const getChipStyles = (theme: Theme, paletteKey: 'success' | 'info' | 'warning' | 'secondary') => ({
  backgroundColor: alpha(theme.palette[paletteKey].main, 0.1),
  color: theme.palette[paletteKey].main,
  border: `1px solid ${alpha(theme.palette[paletteKey].main, 0.16)}`,
});

// Shared styles give controls and surfaces a consistent appearance across every screen.
const buildComponents = (): ThemeOptions['components'] => ({
  MuiCssBaseline: {
    styleOverrides: (theme) => ({
      body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
      '#root': { minHeight: '100dvh' },
      '::selection': { background: alpha(theme.palette.primary.main, 0.25) },
      ':focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 4 },
      '*': { scrollbarWidth: 'thin', scrollbarColor: `${theme.palette.divider} transparent` },
      '@media (prefers-reduced-motion: reduce)': {
        '*, *::before, *::after': { animation: 'none !important', transition: 'none !important' },
      },
    }),
  },
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: { borderRadius: design.layout.controlRadius, padding: '10px 16px',
        minHeight: design.layout.controlHeight, transition: 'all 150ms ease' },
      outlined: ({ theme }) => ({
        borderColor: theme.palette.divider,
        color: theme.palette.text.primary,
        '&:hover': { borderColor: theme.palette.text.secondary, background: theme.palette.action.hover },
      }),
      contained: ({ theme }) => ({
        '&.MuiButton-colorPrimary': {
          backgroundColor: design.colors.primaryButton[theme.palette.mode],
          color: design.colors.primaryButtonText[theme.palette.mode],
          '&:hover': { backgroundColor: theme.palette.mode === 'dark' ? '#ffffff' : '#a73315' },
          '&.Mui-disabled': { backgroundColor: theme.palette.action.disabledBackground, color: theme.palette.action.disabled },
        },
      }),
    },
  },
  MuiIconButton: { styleOverrides: { root: { borderRadius: 8, minWidth: 44, minHeight: design.layout.controlHeight } } },
  MuiPaper: {
    styleOverrides: {
      root: ({ theme }) => ({ backgroundImage: 'none', border: `1px solid ${theme.palette.divider}`, boxShadow: 'none' }),
    },
  },
  MuiCardContent: { styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } } },
  MuiToggleButtonGroup: {
    styleOverrides: {
      root: ({ theme }) => ({ padding: 4, gap: 4, border: `1px solid ${theme.palette.divider}`, borderRadius: 10 }),
      grouped: { border: '0 !important', borderRadius: '7px !important', margin: '0 !important' },
    },
  },
  MuiToggleButton: {
    styleOverrides: {
      root: ({ theme }) => ({
        textTransform: 'none', color: theme.palette.text.secondary, padding: '9px 16px', minHeight: design.layout.controlHeight, lineHeight: 1.5,
        '&.Mui-selected': {
          backgroundColor: alpha(theme.palette.primary.main, 0.12), color: theme.palette.text.primary,
          '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.18) },
        },
      }),
    },
  },
  MuiTab: { styleOverrides: { root: { textTransform: 'none', fontSize: 12, minHeight: 48 } } },
  MuiTabs: { styleOverrides: { indicator: { height: 2, borderRadius: 2 } } },
  MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
  MuiOutlinedInput: {
    styleOverrides: {
      root: { borderRadius: 8, fontSize: 16 },
      notchedOutline: ({ theme }) => ({ borderColor: theme.palette.divider }),
    },
  },
  MuiInput: {
    styleOverrides: {
      root: { fontSize: 16 },
      underline: ({ theme }) => ({ '&:before': { borderBottomColor: theme.palette.divider } }),
    },
  },
  MuiFormHelperText: { styleOverrides: { root: { fontSize: 12 } } },
  MuiInputLabel: { styleOverrides: { root: { fontSize: 14 } } },
  MuiAccordion: {
    defaultProps: { disableGutters: true, elevation: 0 },
    styleOverrides: {
      root: { borderRadius: '12px !important', '&:before': { display: 'none' }, '&.Mui-expanded': { margin: 0 } },
    },
  },
  MuiAccordionSummary: { styleOverrides: { root: { minHeight: 56, padding: '0 20px' } } },
  MuiAccordionDetails: { styleOverrides: { root: { padding: '8px 20px 20px' } } },
  MuiAlert: {
    styleOverrides: {
      root: { borderRadius: 10, fontSize: 13, alignItems: 'center' },
      standard: ({ theme }) => ({
        '&.MuiAlert-colorWarning': {
          backgroundColor: alpha(theme.palette.warning.main, 0.06),
          border: `1px solid ${alpha(theme.palette.warning.main, 0.18)}`,
        },
        '&.MuiAlert-colorInfo': {
          backgroundColor: alpha(theme.palette.info.main, 0.06),
          border: `1px solid ${alpha(theme.palette.info.main, 0.18)}`,
        },
      }),
    },
  },
  MuiChip: {
    styleOverrides: {
      root: { height: design.layout.badgeHeight, borderRadius: design.layout.badgeRadius, fontSize: design.type.badge, fontWeight: 500 },
      colorSuccess: ({ theme }) => getChipStyles(theme, 'success'),
      colorInfo: ({ theme }) => getChipStyles(theme, 'info'),
      colorWarning: ({ theme }) => getChipStyles(theme, 'warning'),
      colorSecondary: ({ theme }) => getChipStyles(theme, 'secondary'),
    },
  },
  MuiTooltip: { styleOverrides: { tooltip: { fontSize: 12, borderRadius: 6 } } },
});

export const buildTheme = (mode: PaletteMode = 'light') => createTheme({
  typography,
  breakpoints: { values: { xs: 0, sm: 600, md: design.layout.desktopBreakpoint, lg: 1200, xl: 1536 } },
  palette: {
    mode,
    primary: { main: design.colors.accent[mode], contrastText: '#111111' },
    secondary: { main: '#aaaaaa' },
    success: { main: design.colors.success[mode] },
    info: { main: design.colors.info[mode] },
    warning: { main: design.colors.warning[mode] },
    error: { main: design.colors.error[mode] },
    divider: design.colors.border[mode],
    background: { default: design.colors.canvas[mode], paper: design.colors.surface[mode] },
    text: { primary: design.colors.text[mode], secondary: design.colors.secondary[mode] },
    action: { hover: mode === 'dark' ? '#ffffff06' : '#00000005', selected: mode === 'dark' ? '#ffffff0d' : '#00000008' },
  },
  shape: { borderRadius: 16 },
  components: buildComponents(),
});

export const theme = buildTheme(localStorage.getItem('freeSleepAppearance') === 'dark' ? 'dark' : 'light');
