import axios from 'axios';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';

const API_URL = Platform.OS === 'web'
  ? (process.env.EXPO_PUBLIC_WEB_API_URL || 'http://localhost:3001')
  : (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3001');

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Adds JWT token + device metadata to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  config.headers['X-Platform'] = Platform.OS;
  config.headers['X-Device'] = Device.modelName || 'unknown';
  config.headers['X-App-Version'] = Constants.expoConfig?.version || '1.0.0';

  return config;
});

// Refresh token on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
        useAuthStore.getState().setTokens(data.data.accessToken, data.data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
