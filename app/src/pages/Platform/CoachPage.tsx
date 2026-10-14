import { baseURL } from '@api/api';
import { useAppStore } from '@state/appStore';
import CoachWorkspace from './CoachWorkspace';

export default function CoachPage() {
  const { side } = useAppStore();
  return <CoachWorkspace key={ `${baseURL}:${side}` } side={ side } />;
}
