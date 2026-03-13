import axios from 'axios';
import { disconnectRealtime } from '../services/realtime';
import { getApiBaseUrl } from './backendUrl';
import { feedback as message } from './feedback';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      disconnectRealtime();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('remember');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('remember');
      window.location.href = '/login';
    }

    if (error.response?.status === 403) {
      message.warning({
        message: '无权限',
        description: error.response?.data?.message || '你没有访问当前功能的权限，请联系管理员。',
        placement: 'topRight',
      });
    }

    return Promise.reject(error);
  },
);

export default api;
