export interface Env {
  FRONTEND_URL: string;
  MICROSOFT_TENANT: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  // Supabase integration
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  // KV namespace for OAuth state
  OAUTH_STATE: KVNamespace;
}

type OAuthProvider = 'google' | 'microsoft';

interface TokenRecord {
  user_id: string;
  provider: string;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
  updated_at: string;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function getFrontendOrigin(env: Env): string {
  try {
    return new URL(env.FRONTEND_URL).origin;
  } catch {
    return env.FRONTEND_URL;
  }
}

function withCorsHeaders(env: Env, headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  result.set('Access-Control-Allow-Origin', getFrontendOrigin(env));
  result.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  result.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  result.set('Access-Control-Allow-Credentials', 'true');
  return result;
}

function json(env: Env, data: unknown, init: ResponseInit = {}): Response {
  const headers = withCorsHeaders(env, { ...JSON_HEADERS, ...(init.headers || {}) });
  return new Response(JSON.stringify(data), { ...init, headers });
}

function redirectToFrontendCallback(env: Env, params: Record<string, string | undefined>): Response {
  const url = new URL(env.FRONTEND_URL);
  url.pathname = '/oauth/callback';
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 0) url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function isValidDateStr(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function getDayRangeUtc(dateStr: string): { startIso: string; endIso: string } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// ===== JWT Verification =====

function base64UrlDecode(str: string): Uint8Array {
  // Add padding if needed
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifySupabaseJwt(env: Env, token: string): Promise<{ sub: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Decode payload
    const payloadStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadStr) as { sub?: string; exp?: number; aud?: string };
    
    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      console.log('JWT expired');
      return null;
    }

    // Verify signature using HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.SUPABASE_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureInput = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(signatureB64);

    const valid = await crypto.subtle.verify({ name: 'HMAC' }, key, signature, signatureInput);
    if (!valid) {
      console.log('JWT signature invalid');
      return null;
    }

    if (!payload.sub) return null;
    return { sub: payload.sub };
  } catch (e) {
    console.error('JWT verification error:', e);
    return null;
  }
}

// ===== Supabase Token Storage =====

async function getStoredToken(env: Env, userId: string, provider: OAuthProvider): Promise<TokenRecord | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/calendar_tokens?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${provider}&select=*`,
    {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    console.error('Failed to fetch token:', await res.text());
    return null;
  }

  const data = await res.json() as TokenRecord[];
  return data.length > 0 ? data[0] : null;
}

async function upsertToken(
  env: Env,
  userId: string,
  provider: OAuthProvider,
  refreshToken: string,
  accessToken: string | null,
  expiresAt: string | null
): Promise<boolean> {
  const now = new Date().toISOString();
  const body = {
    user_id: userId,
    provider,
    refresh_token: refreshToken,
    access_token: accessToken,
    expires_at: expiresAt,
    updated_at: now,
  };

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/calendar_tokens`,
    {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    console.error('Failed to upsert token:', await res.text());
    return false;
  }

  return true;
}

async function deleteToken(env: Env, userId: string, provider: OAuthProvider): Promise<boolean> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/calendar_tokens?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${provider}`,
    {
      method: 'DELETE',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  return res.ok;
}

// ===== Token Exchange & Refresh =====

async function exchangeGoogleCodeForToken(env: Env, code: string, redirectUri: string) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const msg = typeof data?.error_description === 'string' ? data.error_description : 'Failed to exchange Google code';
    throw new Error(msg);
  }
  return data as { access_token: string; refresh_token?: string; expires_in?: number };
}

async function refreshGoogleAccessToken(env: Env, refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error('Failed to refresh Google token:', await res.text());
    return null;
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  return data;
}

async function exchangeMicrosoftCodeForToken(env: Env, code: string, redirectUri: string) {
  const tenant = env.MICROSOFT_TENANT || 'common';
  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    scope: 'offline_access https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/User.Read',
  });

  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const msg = typeof data?.error_description === 'string' ? data.error_description : 'Failed to exchange Microsoft code';
    throw new Error(msg);
  }
  return data as { access_token: string; refresh_token?: string; expires_in?: number };
}

async function refreshMicrosoftAccessToken(env: Env, refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const tenant = env.MICROSOFT_TENANT || 'common';
  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: 'offline_access https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/User.Read',
  });

  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error('Failed to refresh Microsoft token:', await res.text());
    return null;
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  return data;
}

// Get a valid access token, refreshing if needed
async function getValidAccessToken(env: Env, userId: string, provider: OAuthProvider): Promise<string | null> {
  const stored = await getStoredToken(env, userId, provider);
  if (!stored) return null;

  // Check if we have a valid access token
  if (stored.access_token && stored.expires_at) {
    const expiresAt = new Date(stored.expires_at).getTime();
    // Add 5 minute buffer
    if (expiresAt > Date.now() + 5 * 60 * 1000) {
      return stored.access_token;
    }
  }

  // Need to refresh
  let refreshed: { access_token: string; expires_in: number } | null = null;
  if (provider === 'google') {
    refreshed = await refreshGoogleAccessToken(env, stored.refresh_token);
  } else if (provider === 'microsoft') {
    refreshed = await refreshMicrosoftAccessToken(env, stored.refresh_token);
  }

  if (!refreshed) {
    // Refresh failed, token might be revoked
    await deleteToken(env, userId, provider);
    return null;
  }

  // Store the new access token
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await upsertToken(env, userId, provider, stored.refresh_token, refreshed.access_token, expiresAt);

  return refreshed.access_token;
}

// ===== Random State Generation =====

function generateRandomState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// ===== Main Handler =====

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: withCorsHeaders(env) });
    }

    if (path === '/health') {
      return json(env, { ok: true });
    }

    // ===== OAuth Status =====
    if (path === '/api/oauth/status') {
      const token = getBearerToken(request);
      if (!token) return json(env, { error: 'Missing Authorization' }, { status: 401 });

      const jwtPayload = await verifySupabaseJwt(env, token);
      if (!jwtPayload) return json(env, { error: 'Invalid token' }, { status: 401 });

      const userId = jwtPayload.sub;
      const googleToken = await getStoredToken(env, userId, 'google');
      const microsoftToken = await getStoredToken(env, userId, 'microsoft');

      return json(env, {
        google: !!googleToken,
        microsoft: !!microsoftToken,
      });
    }

    // ===== OAuth Disconnect =====
    if (path === '/api/oauth/disconnect' && request.method === 'POST') {
      const token = getBearerToken(request);
      if (!token) return json(env, { error: 'Missing Authorization' }, { status: 401 });

      const jwtPayload = await verifySupabaseJwt(env, token);
      if (!jwtPayload) return json(env, { error: 'Invalid token' }, { status: 401 });

      const userId = jwtPayload.sub;
      const body = await request.json().catch(() => ({})) as { provider?: string };
      const provider = body.provider as OAuthProvider;

      if (provider !== 'google' && provider !== 'microsoft') {
        return json(env, { error: 'Invalid provider' }, { status: 400 });
      }

      await deleteToken(env, userId, provider);
      return json(env, { success: true });
    }

    // ===== OAuth: Google Calendar =====
    if (path === '/auth/google/start') {
      const token = getBearerToken(request);
      if (!token) return json(env, { error: 'Missing Authorization' }, { status: 401 });

      const jwtPayload = await verifySupabaseJwt(env, token);
      if (!jwtPayload) return json(env, { error: 'Invalid token' }, { status: 401 });

      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return json(env, { error: 'Google OAuth is not configured' }, { status: 500 });
      }

      // Generate state and store user_id mapping in KV
      const state = generateRandomState();
      await env.OAUTH_STATE.put(`oauth:${state}`, jwtPayload.sub, { expirationTtl: 600 }); // 10 minutes

      const redirectUri = `${url.origin}/auth/google/callback`;
      const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authorizeUrl.search = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        state,
      }).toString();

      return json(env, { authUrl: authorizeUrl.toString() });
    }

    if (path === '/auth/google/callback') {
      const error = url.searchParams.get('error');
      const state = url.searchParams.get('state') || '';
      
      if (error) {
        return redirectToFrontendCallback(env, { provider: 'google', error });
      }

      // Look up user_id from state
      const userId = await env.OAUTH_STATE.get(`oauth:${state}`);
      if (!userId) {
        return redirectToFrontendCallback(env, { provider: 'google', error: 'Invalid or expired state' });
      }
      // Delete the state after use
      await env.OAUTH_STATE.delete(`oauth:${state}`);

      const code = url.searchParams.get('code');
      if (!code) {
        return redirectToFrontendCallback(env, { provider: 'google', error: 'Missing code' });
      }

      try {
        const redirectUri = `${url.origin}/auth/google/callback`;
        const tokenData = await exchangeGoogleCodeForToken(env, code, redirectUri);
        
        if (!tokenData.refresh_token) {
          return redirectToFrontendCallback(env, { provider: 'google', error: 'No refresh token received. Please revoke access and try again.' });
        }

        // Calculate expiry
        const expiresAt = tokenData.expires_in 
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null;

        // Store tokens in Supabase
        const stored = await upsertToken(env, userId, 'google', tokenData.refresh_token, tokenData.access_token, expiresAt);
        if (!stored) {
          return redirectToFrontendCallback(env, { provider: 'google', error: 'Failed to store tokens' });
        }

        // Redirect to frontend with success (no tokens in URL)
        return redirectToFrontendCallback(env, { provider: 'google', success: '1' });
      } catch (e: any) {
        return redirectToFrontendCallback(env, { provider: 'google', error: e?.message || 'OAuth failed' });
      }
    }

    // ===== OAuth: Microsoft Outlook =====
    if (path === '/auth/microsoft/start') {
      const token = getBearerToken(request);
      if (!token) return json(env, { error: 'Missing Authorization' }, { status: 401 });

      const jwtPayload = await verifySupabaseJwt(env, token);
      if (!jwtPayload) return json(env, { error: 'Invalid token' }, { status: 401 });

      if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
        return json(env, { error: 'Microsoft OAuth is not configured' }, { status: 500 });
      }

      const tenant = env.MICROSOFT_TENANT || 'common';
      const state = generateRandomState();
      await env.OAUTH_STATE.put(`oauth:${state}`, jwtPayload.sub, { expirationTtl: 600 });

      const redirectUri = `${url.origin}/auth/microsoft/callback`;
      const authorizeUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
      authorizeUrl.search = new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        response_mode: 'query',
        scope: 'offline_access https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/User.Read',
        state,
      }).toString();

      return json(env, { authUrl: authorizeUrl.toString() });
    }

    if (path === '/auth/microsoft/callback') {
      const error = url.searchParams.get('error');
      const state = url.searchParams.get('state') || '';
      
      if (error) {
        const description = url.searchParams.get('error_description') || error;
        return redirectToFrontendCallback(env, { provider: 'microsoft', error: description });
      }

      const userId = await env.OAUTH_STATE.get(`oauth:${state}`);
      if (!userId) {
        return redirectToFrontendCallback(env, { provider: 'microsoft', error: 'Invalid or expired state' });
      }
      await env.OAUTH_STATE.delete(`oauth:${state}`);

      const code = url.searchParams.get('code');
      if (!code) {
        return redirectToFrontendCallback(env, { provider: 'microsoft', error: 'Missing code' });
      }

      try {
        const redirectUri = `${url.origin}/auth/microsoft/callback`;
        const tokenData = await exchangeMicrosoftCodeForToken(env, code, redirectUri);
        
        if (!tokenData.refresh_token) {
          return redirectToFrontendCallback(env, { provider: 'microsoft', error: 'No refresh token received' });
        }

        const expiresAt = tokenData.expires_in 
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null;

        const stored = await upsertToken(env, userId, 'microsoft', tokenData.refresh_token, tokenData.access_token, expiresAt);
        if (!stored) {
          return redirectToFrontendCallback(env, { provider: 'microsoft', error: 'Failed to store tokens' });
        }

        return redirectToFrontendCallback(env, { provider: 'microsoft', success: '1' });
      } catch (e: any) {
        return redirectToFrontendCallback(env, { provider: 'microsoft', error: e?.message || 'OAuth failed' });
      }
    }

    // ===== API: Fetch Google events =====
    if (path === '/api/google/events') {
      const token = getBearerToken(request);
      if (!token) return json(env, { error: 'Missing Authorization' }, { status: 401 });

      const jwtPayload = await verifySupabaseJwt(env, token);
      if (!jwtPayload) return json(env, { error: 'Invalid token' }, { status: 401 });

      const dateStr = url.searchParams.get('date') || '';
      if (!isValidDateStr(dateStr)) return json(env, { error: 'Invalid date (expected YYYY-MM-DD)' }, { status: 400 });

      const accessToken = await getValidAccessToken(env, jwtPayload.sub, 'google');
      if (!accessToken) {
        return json(env, { error: 'Not connected to Google Calendar', needsAuth: true }, { status: 401 });
      }

      const { startIso, endIso } = getDayRangeUtc(dateStr);
      const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      apiUrl.search = new URLSearchParams({
        timeMin: startIso,
        timeMax: endIso,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '50',
      }).toString();

      const res = await fetch(apiUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = (await res.json().catch(() => ({}))) as any;
      
      if (!res.ok) {
        if (res.status === 401) {
          // Token was invalid despite our refresh, clear it
          await deleteToken(env, jwtPayload.sub, 'google');
          return json(env, { error: 'Calendar access expired, please reconnect', needsAuth: true }, { status: 401 });
        }
        const msg = typeof data?.error?.message === 'string' ? data.error.message : 'Failed to fetch Google events';
        return json(env, { error: msg }, { status: res.status });
      }

      // Format events with time
      const events = Array.isArray(data?.items) 
        ? data.items.map((e: any) => {
            const start = e.start?.dateTime || e.start?.date;
            let timeString = '';
            if (start) {
              if (start.includes('T')) {
                const dateObj = new Date(start);
                timeString = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
              } else {
                timeString = 'All Day';
              }
            }
            const summary = e.summary || 'No Title';
            return timeString ? `${timeString} - ${summary}` : summary;
          }).filter((s: any) => typeof s === 'string')
        : [];
      
      return json(env, { events });
    }

    // ===== API: Fetch Microsoft events =====
    if (path === '/api/microsoft/events') {
      const token = getBearerToken(request);
      if (!token) return json(env, { error: 'Missing Authorization' }, { status: 401 });

      const jwtPayload = await verifySupabaseJwt(env, token);
      if (!jwtPayload) return json(env, { error: 'Invalid token' }, { status: 401 });

      const dateStr = url.searchParams.get('date') || '';
      if (!isValidDateStr(dateStr)) return json(env, { error: 'Invalid date (expected YYYY-MM-DD)' }, { status: 400 });

      const accessToken = await getValidAccessToken(env, jwtPayload.sub, 'microsoft');
      if (!accessToken) {
        return json(env, { error: 'Not connected to Microsoft Outlook', needsAuth: true }, { status: 401 });
      }

      const { startIso, endIso } = getDayRangeUtc(dateStr);
      const apiUrl = new URL('https://graph.microsoft.com/v1.0/me/calendarView');
      apiUrl.search = new URLSearchParams({
        startDateTime: startIso,
        endDateTime: endIso,
        $select: 'subject,start,end',
        $top: '50',
      }).toString();

      const res = await fetch(apiUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'outlook.timezone="UTC"',
        },
      });
      const data = (await res.json().catch(() => ({}))) as any;
      
      if (!res.ok) {
        if (res.status === 401) {
          await deleteToken(env, jwtPayload.sub, 'microsoft');
          return json(env, { error: 'Calendar access expired, please reconnect', needsAuth: true }, { status: 401 });
        }
        const msg = typeof data?.error?.message === 'string' ? data.error.message : 'Failed to fetch Microsoft events';
        return json(env, { error: msg }, { status: res.status });
      }

      // Format events with time
      const events = Array.isArray(data?.value)
        ? data.value.map((e: any) => {
            const start = e.start?.dateTime;
            let timeString = '';
            if (start) {
              const dateObj = new Date(start + 'Z');
              timeString = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            }
            const subject = e.subject || 'No Title';
            return timeString ? `${timeString} - ${subject}` : subject;
          }).filter((s: any) => typeof s === 'string')
        : [];

      return json(env, { events });
    }

    return new Response('Not found', { status: 404, headers: withCorsHeaders(env) });
  },
};
