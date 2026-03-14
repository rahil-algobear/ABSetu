import { jwtDecode } from 'jwt-decode';
import Cookies from 'js-cookie';

interface JWTPayload {
  exp: number;
  sub: string;
  token_type: string;
}

/** Default refresh token lifetime in days (must match backend REFRESH_TOKEN_EXPIRE_DAYS). */
const REFRESH_TOKEN_EXPIRE_DAYS = 30;

export function decodeToken(token: string): JWTPayload {
  return jwtDecode<JWTPayload>(token);
}

export function getTokenExpirationDate(token: string): Date {
  const decoded = decodeToken(token);
  const expirationDate = new Date(decoded.exp * 1000);

  if (isNaN(expirationDate.getTime())) {
    console.error('Invalid expiration date from token:', decoded.exp);
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  return expirationDate;
}

export function setTokens(access_token: string, refresh_token: string) {
  // Refresh token is an opaque string (not JWT), so use a fixed expiry
  const refreshExpiry = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000
  );

  // Set access token cookie — use refreshExpiry so the cookie outlives the JWT.
  // When the access token JWT expires the axios interceptor will auto-refresh.
  try {
    Cookies.set('access_token', access_token, {
      expires: refreshExpiry,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
  } catch (error) {
    console.error('Error setting access token cookie:', error);
  }

  // Set refresh token cookie (opaque, not JWT-decodable)
  try {
    Cookies.set('refresh_token', refresh_token, {
      expires: refreshExpiry,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
  } catch (error) {
    console.error('Error setting refresh token cookie:', error);
  }
}

export function fetchTokens(): {
  access_token: string | undefined;
  refresh_token: string | undefined;
} {
  try {
    const access_token = Cookies.get('access_token');
    const refresh_token = Cookies.get('refresh_token');
    return { access_token, refresh_token };
  } catch (error) {
    console.error('Error fetching tokens:', error);
    return { access_token: undefined, refresh_token: undefined };
  }
}

export function removeTokens() {
  try {
    Cookies.remove('access_token', { path: '/' });
    Cookies.remove('refresh_token', { path: '/' });
  } catch (error) {
    console.error('Error removing tokens:', error);
  }
}
