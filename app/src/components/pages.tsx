import { ReactElement } from 'react';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import NightsStayOutlinedIcon from '@mui/icons-material/NightsStayOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';

type Page = { title: string; route: string; icon: ReactElement };

export const PAGES: Page[] = [
  { title: 'Tonight', route: '/', icon: <NightsStayOutlinedIcon/> },
  { title: 'Sleep', route: '/insights', icon: <BarChartOutlinedIcon/> },
  { title: 'Coach', route: '/coach', icon: <AutoAwesomeOutlinedIcon/> },
  { title: 'Routines', route: '/schedules', icon: <ScheduleOutlinedIcon/> },
  { title: 'Settings', route: '/settings', icon: <SettingsOutlinedIcon/> },
];

export const getPageForPath = (pathname: string) => {
  if (['/', '/left', '/right'].includes(pathname)) return PAGES[0];
  if (['/data/sleep', '/data/vitals'].some(route => pathname === route || pathname.startsWith(`${route}/`))) return PAGES[1];
  return PAGES.find(page => pathname === page.route || pathname.startsWith(`${page.route}/`)) ?? PAGES[0];
};
