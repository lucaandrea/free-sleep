import axios from './api';
import type { AlarmJob } from '../../../server/src/db/schedulesSchema.ts';
import type { Side } from '../../../server/src/db/schedulesSchema.ts';
import type { AlarmChange, AlarmPreview } from '../../../server/src/alarms/types.ts';
import { useQuery } from '@tanstack/react-query';


export const postAlarm = (alarmJob: AlarmJob) => {
  return axios.post('/alarm', alarmJob);
};

export const useNextAlarm = (side: Side) => useQuery({
  queryKey: ['alarm', side],
  queryFn: async () => (await axios.get<AlarmPreview>('/alarm/next', { params: { side } })).data,
  refetchInterval: 15_000,
  retry: 1,
});

export const changeAlarm = async (change: AlarmChange) => (await axios.post<AlarmPreview>('/alarm/override', change)).data;
