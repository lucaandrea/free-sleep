import { useAppStore } from '@state/appStore';
import NextAlarmCard from './NextAlarmCard';

export default function AlarmNotification() {
  const side = useAppStore(state => state.side);
  return <NextAlarmCard key={ side } side={ side } />;
}
