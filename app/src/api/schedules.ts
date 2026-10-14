import axios from './api';
import { useQuery } from '@tanstack/react-query';
import { DeepPartial } from 'ts-essentials';
import { Schedules, SchedulesSchema } from '@api/schedulesSchema.ts';


export const useSchedules = () => useQuery<Schedules>({
  queryKey: ['useSchedules'],
  queryFn: async () => {
    const response = await axios.get<Schedules>('/schedules');
    return SchedulesSchema.parse(response.data);
  },
});


export const postSchedules = (schedules: DeepPartial<Schedules>) => {
  return axios.post('/schedules', schedules);
};




export const saveRoutine = async (input: import('../../../server/src/routines/contract').RoutineSave) =>
  (await axios.post<Schedules>('/schedules/routine', input)).data;
