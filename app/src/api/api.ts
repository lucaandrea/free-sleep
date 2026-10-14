import axios from 'axios';

const inDev = import.meta.env.VITE_ENV === 'dev';
const inDemo = import.meta.env.VITE_ENV === 'demo';

if (inDev && !import.meta.env.VITE_POD_IP) {
  console.warn(
    'Missing ENV variable: VITE_POD_IP! ' +
    'If you\'d like to run the vite server locally and send API requests to your pod, you can run ' +
    '\'VITE_POD_IP=<YOUR_POD_IP> npm run dev\' ' +
    'ex: \'VITE_POD_IP=<YOUR_POD_IP> npm run dev\''
  );
}
const storedURL = inDemo ? null : localStorage.getItem('freeSleepURL');
const baseURL = storedURL || (inDev && import.meta.env.VITE_POD_IP ? `http://${import.meta.env.VITE_POD_IP}:3000` : `${window.location.origin}`);

const axiosInstance = axios.create({
  baseURL: `${baseURL}/api/`,
  timeout: 15000,
});

axiosInstance.interceptors.request.use(request => {
  const token = inDemo ? null : sessionStorage.getItem('freeSleepToken');
  if (token) request.headers.Authorization = `Bearer ${token}`;
  return request;
});

axiosInstance.interceptors.response.use(response => {
  if (response.status !== 204 && !String(response.headers['content-type'] || '').includes('application/json')) {
    throw new Error('This address did not return the Free Sleep API. Check your connection in Settings.');
  }
  return response;
});

export default axiosInstance;
export { baseURL };
