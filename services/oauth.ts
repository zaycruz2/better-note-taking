/**
 * OAuth Service - server-side token persistence.
 *
 * Frontend never stores access/refresh tokens.
 * We keep only a boolean \"connected\" flag locally for UI convenience.
 * All calendar API calls use the user's Supabase session access token.
 */

import { getSession } from './supabaseClient';

// Backend URL - change this when deploying
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';

export type OAuthProvider = 'google' | 'microsoft';

const CONNECTED_FLAG_KEY = (provider: OAuthProvider) => `oauth_connected_${provider}`;

function setConnectedFlag(provider: OAuthProvider, value: boolean) {
  try {
    if (value) localStorage.setItem(CONNECTED_FLAG_KEY(provider), '1');
    else localStorage.removeItem(CONNECTED_FLAG_KEY(provider));
  } catch {
    // ignore
  }
}

export const isConnected = (provider: OAuthProvider): boolean => {
  try {
    return localStorage.getItem(CONNECTED_FLAG_KEY(provider)) === '1';
  } catch {
    return false;
  }
};

async function getSupabaseAccessToken(): Promise<string> {
  const session = await getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Not signed in. Please sign in to connect your calendar.');
  return accessToken;
}

// ===== OAuth Flow =====

/**
 * Starts OAuth flow server-side. Requires Supabase session access token.
 * Backend returns { authUrl }, which we redirect to.
 */
export const startOAuthFlow = async (provider: OAuthProvider): Promise<void> => {
  const accessToken = await getSupabaseAccessToken();
  const res = await fetch(`${BACKEND_URL}/auth/${provider}/start`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as any;
    throw new Error(data.error || 'Failed to start OAuth flow');
  }

  const data = await res.json() as { authUrl?: string };
  if (!data.authUrl) throw new Error('Missing authUrl from backend');
  window.location.href = data.authUrl;
};

/**
 * Handles /oauth/callback redirect from backend.
 * Backend does not include tokens in URL, only provider + success or error.
 */
export const handleOAuthCallback = (): { provider: OAuthProvider; success: boolean; error?: string } | null => {
  const url = new URL(window.location.href);

  if (!url.pathname.includes('/oauth/callback') && !url.searchParams.has('provider')) {
    return null;
  }

  const provider = url.searchParams.get('provider') as OAuthProvider | null;
  const success = url.searchParams.get('success');
  const error = url.searchParams.get('error');

  if (!provider) return null;

  // Clear URL params
  window.history.replaceState({}, '', '/');

  if (error) {
    setConnectedFlag(provider, false);
    return { provider, success: false, error };
  }

  if (success === '1') {
    setConnectedFlag(provider, true);
    return { provider, success: true };
  }

  return { provider, success: false, error: 'OAuth completed without success' };
};

// ===== Status =====

export const refreshOAuthStatus = async (): Promise<{ google: boolean; microsoft: boolean }> => {
  const accessToken = await getSupabaseAccessToken();
  const res = await fetch(`${BACKEND_URL}/api/oauth/status`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    // Don't hard fail UI; assume disconnected if we can't check.
    setConnectedFlag('google', false);
    setConnectedFlag('microsoft', false);
    return { google: false, microsoft: false };
  }
  const data = await res.json() as { google?: boolean; microsoft?: boolean };
  setConnectedFlag('google', !!data.google);
  setConnectedFlag('microsoft', !!data.microsoft);
  return { google: !!data.google, microsoft: !!data.microsoft };
};

// ===== API Calls =====

type EventsApiResponse =
  | { events: string[] }
  | { events: Array<{ start: string | null; summary: string }> };

function formatEventLine(evt: { start: string | null; summary: string }): string {
  const summary = evt.summary || 'No Title';
  const start = evt.start;
  if (!start) return summary;
  // All-day events come back as YYYY-MM-DD
  if (!start.includes('T')) return `All Day - ${summary}`;
  const d = new Date(start);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${time} - ${summary}`;
}

export const fetchEvents = async (provider: OAuthProvider, dateStr: string): Promise<string[]> => {
  const accessToken = await getSupabaseAccessToken();

  // Compute local day boundaries and pass to backend
  // This ensures we query for events in the user's actual day, not UTC
  const localStart = new Date(`${dateStr}T00:00:00`);
  const localEnd = new Date(`${dateStr}T23:59:59.999`);
  const timeMin = localStart.toISOString();
  const timeMax = localEnd.toISOString();

  const params = new URLSearchParams({
    date: dateStr,
    timeMin,
    timeMax,
  });

  const res = await fetch(`${BACKEND_URL}/api/${provider}/events?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as any;
    if (res.status === 401 && data?.needsAuth) {
      setConnectedFlag(provider, false);
      throw new Error('Calendar connection expired. Please reconnect in Settings.');
    }
    throw new Error(data.error || `Failed to fetch ${provider} events`);
  }

  const data = await res.json() as EventsApiResponse;
  const events = (data as any)?.events;
  if (!Array.isArray(events)) return [];
  if (events.length === 0) return [];
  if (typeof events[0] === 'string') return events as string[];
  return (events as Array<{ start: string | null; summary: string }>).map(formatEventLine);
};

// ===== Disconnect =====

export const disconnect = async (provider: OAuthProvider): Promise<void> => {
  const accessToken = await getSupabaseAccessToken();
  await fetch(`${BACKEND_URL}/api/oauth/disconnect`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ provider }),
  }).catch(() => {});

  setConnectedFlag(provider, false);
};


