/**
 * OAuth Service - handles authentication with Google and Microsoft
 * via the backend Cloudflare Worker.
 */

// Backend URL - change this when deploying
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';

export type OAuthProvider = 'google' | 'microsoft';

interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

// ===== Token Storage =====

export const getToken = (provider: OAuthProvider): TokenData | null => {
  const stored = localStorage.getItem(`oauth_${provider}`);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

export const setToken = (provider: OAuthProvider, data: TokenData): void => {
  localStorage.setItem(`oauth_${provider}`, JSON.stringify(data));
};

export const clearToken = (provider: OAuthProvider): void => {
  localStorage.removeItem(`oauth_${provider}`);
};

export const isConnected = (provider: OAuthProvider): boolean => {
  const token = getToken(provider);
  return !!token?.accessToken;
};

// ===== OAuth Flow =====

export const startOAuthFlow = (provider: OAuthProvider): void => {
  // Generate a random state for CSRF protection
  const state = Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem('oauth_state', state);
  sessionStorage.setItem('oauth_provider', provider);

  // Redirect to backend auth endpoint
  window.location.href = `${BACKEND_URL}/auth/${provider}?state=${state}`;
};

export const handleOAuthCallback = (): { provider: OAuthProvider; success: boolean; error?: string } | null => {
  const url = new URL(window.location.href);
  
  // Check if this is an OAuth callback
  if (!url.pathname.includes('/oauth/callback') && !url.searchParams.has('access_token') && !url.searchParams.has('error')) {
    // Also check hash for implicit flow
    if (!url.hash.includes('access_token')) {
      return null;
    }
  }

  const provider = url.searchParams.get('provider') as OAuthProvider | null;
  const accessToken = url.searchParams.get('access_token');
  const refreshToken = url.searchParams.get('refresh_token');
  const error = url.searchParams.get('error');

  if (!provider) {
    return null;
  }

  // Clear URL params
  window.history.replaceState({}, '', '/');

  if (error) {
    return { provider, success: false, error };
  }

  if (accessToken) {
    setToken(provider, {
      accessToken,
      refreshToken: refreshToken || undefined,
      expiresAt: Date.now() + 3600 * 1000, // Assume 1 hour expiry
    });
    return { provider, success: true };
  }

  return { provider, success: false, error: 'No access token received' };
};

// ===== API Calls =====

export const fetchEvents = async (provider: OAuthProvider, dateStr: string): Promise<string[]> => {
  const token = getToken(provider);
  if (!token?.accessToken) {
    throw new Error(`Not connected to ${provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'}`);
  }

  const res = await fetch(`${BACKEND_URL}/api/${provider}/events?date=${dateStr}`, {
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as any;
    if (res.status === 401) {
      // Token expired, clear it
      clearToken(provider);
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(data.error || `Failed to fetch ${provider} events`);
  }

  const data = await res.json() as { events: string[] };
  return data.events || [];
};

// ===== Disconnect =====

export const disconnect = (provider: OAuthProvider): void => {
  clearToken(provider);
};

