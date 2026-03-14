import authAxios, { publicAxios } from './axios';
import { Place, UserRegisterData, UserLoginData, OTPVerifyData, LoginResponse, VerifyOTPResponse, UserProfileResponse } from '../types';

export const placeApi = {
  // Get all places
  getPlaces: async () => {
    const response = await authAxios.get<Place[]>('/places');
    return response.data;
  },

  // Get a single place
  getPlace: async (id: string) => {
    const response = await authAxios.get<Place>(`/places/${id}`);
    return response.data;
  },

  // Create a new place
  createPlace: async (place: Omit<Place, 'id'>) => {
    const response = await authAxios.post<Place>('/places', place);
    return response.data;
  },

  // Update a place
  updatePlace: async (id: string, place: Partial<Place>) => {
    const response = await authAxios.put<Place>(`/places/${id}`, place);
    return response.data;
  },

  // Delete a place
  deletePlace: async (id: string) => {
    const response = await authAxios.delete(`/places/${id}`);
    return response.data;
  }
};

export const authApi = {
  // Register new user
  register: async (data: UserRegisterData): Promise<LoginResponse> => {
    const response = await publicAxios.post<LoginResponse>('/auth/register', data);
    return response.data;
  },

  // Login - sends OTP
  login: async (data: UserLoginData): Promise<LoginResponse> => {
    try {
      const response = await publicAxios.post<LoginResponse>('/auth/login', data);
      return response.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        const apiError = new Error(error.response.data.message) as Error & { detail?: string };
        apiError.detail = error.response.data.message;
        throw apiError;
      }
      throw new Error('Failed to send OTP');
    }
  },

  // Verify OTP
  verifyOTP: async (data: OTPVerifyData): Promise<VerifyOTPResponse> => {
    try {
      const response = await publicAxios.post<VerifyOTPResponse>('/auth/verify-otp', data);
      return response.data;
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Invalid OTP');
    }
  },

  // Refresh token
  refreshToken: async (refreshToken: string): Promise<VerifyOTPResponse> => {
    const response = await publicAxios.post<VerifyOTPResponse>('/auth/refresh-token', {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  // Get user profile
  getProfile: async (): Promise<UserProfileResponse> => {
    const response = await authAxios.get<UserProfileResponse>('/user/profile');
    return response.data;
  },

  // Logout — revoke the refresh token server-side
  logout: async (refreshToken: string) => {
    try {
      await publicAxios.post('/auth/logout', { refresh_token: refreshToken });
    } catch {
      // Ignore server errors on logout — client-side cleanup is what matters
    }
    return { message: 'Logged out' };
  },
}; 