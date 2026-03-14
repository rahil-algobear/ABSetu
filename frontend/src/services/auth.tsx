"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { setTokens, removeTokens, fetchTokens } from '../utils/jwt';
import { authApi } from './api';

interface AuthContextType {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  login: (accessToken: string, refreshToken: string, redirectUrl?: string) => void;
  logout: () => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  useEffect(() => {
    // Check for tokens in cookies on mount
    const { access_token, refresh_token } = fetchTokens();
    if (access_token && refresh_token) {
      setAccessToken(access_token);
      setRefreshToken(refresh_token);
      setIsAuthenticated(true);
    } else {
      setAccessToken(null);
      setRefreshToken(null);
      setIsAuthenticated(false);
    }
  }, []);

  const login = (newAccessToken: string, newRefreshToken: string, redirectUrl?: string) => {
    setTokens(newAccessToken, newRefreshToken);
    setAccessToken(newAccessToken);
    setRefreshToken(newRefreshToken);
    setIsAuthenticated(true);
  };

  const logout = () => {
    // Revoke the refresh token server-side (fire-and-forget)
    const { refresh_token } = fetchTokens();
    if (refresh_token) {
      authApi.logout(refresh_token);
    }

    removeTokens();
    setAccessToken(null);
    setRefreshToken(null);
    setIsAuthenticated(false);
  };

  const updateTokens = (newAccessToken: string, newRefreshToken: string) => {
    setTokens(newAccessToken, newRefreshToken);
    setAccessToken(newAccessToken);
    setRefreshToken(newRefreshToken);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, accessToken, refreshToken, login, logout, updateTokens }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 