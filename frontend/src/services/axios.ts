import axios from 'axios';
import { fetchTokens, setTokens, removeTokens } from '../utils/jwt';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';

// Base axios instance for public endpoints
export const publicAxios = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Authenticated axios instance
const authAxios = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
authAxios.interceptors.request.use(
  (config) => {
    const { access_token } = fetchTokens();
    if (access_token && config.headers) {
      config.headers.Authorization = `Bearer ${access_token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling token refresh
authAxios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as any;

    // If error is 401 and we haven't tried to refresh token yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const { refresh_token } = fetchTokens();
        if (!refresh_token) {
          throw new Error('No refresh token available');
        }

        const response = await publicAxios.post<TokenResponse>('/auth/refresh-token', {
          refresh_token,
        });

        const { access_token, refresh_token: new_refresh_token } = response.data;
        setTokens(access_token, new_refresh_token);

        // Retry the original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
        return authAxios(originalRequest);
      } catch (refreshError) {
        // If refresh token fails, redirect to login
        removeTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default authAxios; 