import { Alert, Button, Stack } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@state/appStore';
import { postDeviceStatus, useDeviceStatus } from '@api/deviceStatus';
import { useSettings } from '@api/settings';
import { errorMessage } from '@api/platform';
import AwayNotification from '../ControlTempPage/AwayNotification';
import AlarmNotification from '../ControlTempPage/AlarmNotification';

export default function PodNotifications() {
  const { side } = useAppStore();
  const device = useDeviceStatus();
  const settings = useSettings();
  const queries = useQueryClient();
  const dismiss = useMutation({
    mutationFn: () => postDeviceStatus({ [side]: { isAlarmVibrating: false } }),
    onSuccess: () => queries.invalidateQueries({ queryKey: ['useDeviceStatus'] }),
  });
  return <Stack spacing={ 1 }>
    { device.data?.[side].isAlarmVibrating && <Alert
      severity="warning"
      action={
        <Button disabled={ dismiss.isPending } onClick={ () => dismiss.mutate() }>Dismiss alarm</Button>
      }>Your alarm is vibrating.</Alert> }
    { dismiss.isError && <Alert severity="error">{ errorMessage(dismiss.error) }</Alert> }
    { device.data?.isPriming && <Alert severity="info">Your Pod is priming.</Alert> }
    { device.data?.waterLevel === 'false' && <Alert severity="warning">Refill your Pod’s water tank.</Alert> }
    <AwayNotification settings={ settings.data } />
    <AlarmNotification />
  </Stack>;
}
