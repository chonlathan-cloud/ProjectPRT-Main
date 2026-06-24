export const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

const decodeBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  return atob(padded);
};

export const getAuthToken = () => localStorage.getItem(TOKEN_KEY);

export const clearAuthSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const isTokenExpired = (token: string | null) => {
  if (!token) {
    return true;
  }

  const [, payload] = token.split('.');

  if (!payload) {
    return false;
  }

  try {
    const decoded = JSON.parse(decodeBase64Url(payload)) as { exp?: number };

    if (!decoded.exp) {
      return false;
    }

    return decoded.exp * 1000 <= Date.now();
  } catch (error) {
    console.warn('Failed to decode auth token:', error);
    return true;
  }
};

export const hasValidAuthSession = () => {
  const token = getAuthToken();

  if (isTokenExpired(token)) {
    clearAuthSession();
    return false;
  }

  return true;
};

export const notifyAuthSessionExpired = () => {
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
};
