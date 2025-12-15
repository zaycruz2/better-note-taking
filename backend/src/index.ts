/**
 * MonoFocus OAuth Backend - Cloudflare Worker
 * 
 * Handles OAuth flows for Google Calendar and Microsoft Outlook
 * so the frontend doesn't need to expose client IDs.
 */

interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  FRONTEND_URL: string;
  MICROSOFT_TENANT: string;
}

// Helper to create JSON responses
const json = (data: any, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

// CORS headers
const corsHeaders = (env: Env) => ({
  'Access-Control-Allow-Origin': env.FRONTEND_URL,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
});

// Handle CORS preflight
const handleOptions = (env: Env) =>
  new Response(null, { status: 204, headers: corsHeaders(env) });

// Google OAuth URLs
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// Microsoft OAuth URLs
const msAuthUrl = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
const msTokenUrl = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
const MS_GRAPH_API = 'https://graph.microsoft.com/v1.0';

// Scopes
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.events.readonly';
const MICROSOFT_SCOPES = 'openid offline_access Calendars.Read';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(env);
    }

    try {
      // ===== Google OAuth =====
      if (path === '/auth/google') {
        return startGoogleAuth(url, env);
      }
      if (path === '/auth/google/callback') {
        return handleGoogleCallback(url, env);
      }
      if (path === '/api/google/events') {
        return fetchGoogleEvents(request, url, env);
      }

      // ===== Microsoft OAuth =====
      if (path === '/auth/microsoft') {
        return startMicrosoftAuth(url, env);
      }
      if (path === '/auth/microsoft/callback') {
        return handleMicrosoftCallback(url, env);
      }
      if (path === '/api/microsoft/events') {
        return fetchMicrosoftEvents(request, url, env);
      }

      // Health check
      if (path === '/health') {
        return json({ status: 'ok', timestamp: Date.now() });
      }

      return json({ error: 'Not found' }, 404);
    } catch (err: any) {
      console.error('Worker error:', err);
      return json({ error: err.message || 'Internal error' }, 500, corsHeaders(env));
    }
  },
};

// ===== GOOGLE =====

function startGoogleAuth(url: URL, env: Env): Response {
  const state = url.searchParams.get('state') || '';
  const redirectUri = `${url.origin}/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return Response.redirect(`${GOOGLE_AUTH_URL}?${params}`, 302);
}

async function handleGoogleCallback(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return redirectToFrontend(env, 'google', null, error);
  }
  if (!code) {
    return redirectToFrontend(env, 'google', null, 'No code received');
  }

  const redirectUri = `${url.origin}/auth/google/callback`;

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await tokenRes.json() as any;

  if (tokenData.error) {
    return redirectToFrontend(env, 'google', null, tokenData.error_description || tokenData.error);
  }

  return redirectToFrontend(env, 'google', tokenData.access_token, null, tokenData.refresh_token);
}

async function fetchGoogleEvents(request: Request, url: URL, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing or invalid Authorization header' }, 401, corsHeaders(env));
  }

  const accessToken = authHeader.slice(7);
  const dateStr = url.searchParams.get('date');
  if (!dateStr) {
    return json({ error: 'Missing date parameter' }, 400, corsHeaders(env));
  }

  const timeMin = new Date(`${dateStr}T00:00:00`).toISOString();
  const timeMax = new Date(`${dateStr}T23:59:59`).toISOString();

  const calendarUrl = new URL(`${GOOGLE_CALENDAR_API}/calendars/primary/events`);
  calendarUrl.searchParams.set('timeMin', timeMin);
  calendarUrl.searchParams.set('timeMax', timeMax);
  calendarUrl.searchParams.set('singleEvents', 'true');
  calendarUrl.searchParams.set('orderBy', 'startTime');

  const res = await fetch(calendarUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({})) as any;
    return json(
      { error: errData.error?.message || 'Failed to fetch Google events' },
      res.status,
      corsHeaders(env)
    );
  }

  const data = await res.json() as any;
  const events = (data.items || []).map((event: any) => {
    const start = event.start?.dateTime || event.start?.date;
    let timeString = 'All Day';
    if (start?.includes('T')) {
      timeString = new Date(start).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return `${timeString} - ${event.summary || '(No title)'}`;
  });

  return json({ events }, 200, corsHeaders(env));
}

// ===== MICROSOFT =====

function startMicrosoftAuth(url: URL, env: Env): Response {
  const state = url.searchParams.get('state') || '';
  const redirectUri = `${url.origin}/auth/microsoft/callback`;

  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: MICROSOFT_SCOPES,
    response_mode: 'query',
    state,
  });

  return Response.redirect(`${msAuthUrl(env.MICROSOFT_TENANT)}?${params}`, 302);
}

async function handleMicrosoftCallback(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');

  if (error) {
    return redirectToFrontend(env, 'microsoft', null, errorDesc || error);
  }
  if (!code) {
    return redirectToFrontend(env, 'microsoft', null, 'No code received');
  }

  const redirectUri = `${url.origin}/auth/microsoft/callback`;

  const tokenRes = await fetch(msTokenUrl(env.MICROSOFT_TENANT), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      scope: MICROSOFT_SCOPES,
    }),
  });

  const tokenData = await tokenRes.json() as any;

  if (tokenData.error) {
    return redirectToFrontend(env, 'microsoft', null, tokenData.error_description || tokenData.error);
  }

  return redirectToFrontend(env, 'microsoft', tokenData.access_token, null, tokenData.refresh_token);
}

async function fetchMicrosoftEvents(request: Request, url: URL, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing or invalid Authorization header' }, 401, corsHeaders(env));
  }

  const accessToken = authHeader.slice(7);
  const dateStr = url.searchParams.get('date');
  if (!dateStr) {
    return json({ error: 'Missing date parameter' }, 400, corsHeaders(env));
  }

  const startDateTime = `${dateStr}T00:00:00`;
  const endDateTime = `${dateStr}T23:59:59`;

  const graphUrl = new URL(`${MS_GRAPH_API}/me/calendarView`);
  graphUrl.searchParams.set('startDateTime', startDateTime);
  graphUrl.searchParams.set('endDateTime', endDateTime);
  graphUrl.searchParams.set('$orderby', 'start/dateTime');
  graphUrl.searchParams.set('$select', 'subject,start,end,isAllDay');

  const res = await fetch(graphUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({})) as any;
    return json(
      { error: errData.error?.message || 'Failed to fetch Microsoft events' },
      res.status,
      corsHeaders(env)
    );
  }

  const data = await res.json() as any;
  const events = (data.value || []).map((event: any) => {
    let timeString = 'All Day';
    if (!event.isAllDay && event.start?.dateTime) {
      timeString = new Date(event.start.dateTime + 'Z').toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return `${timeString} - ${event.subject || '(No title)'}`;
  });

  return json({ events }, 200, corsHeaders(env));
}

// ===== HELPERS =====

function redirectToFrontend(
  env: Env,
  provider: 'google' | 'microsoft',
  accessToken: string | null,
  error: string | null,
  refreshToken?: string
): Response {
  const frontendUrl = new URL(`${env.FRONTEND_URL}/oauth/callback`);
  frontendUrl.searchParams.set('provider', provider);

  if (error) {
    frontendUrl.searchParams.set('error', error);
  } else if (accessToken) {
    frontendUrl.searchParams.set('access_token', accessToken);
    if (refreshToken) {
      frontendUrl.searchParams.set('refresh_token', refreshToken);
    }
  }

  return Response.redirect(frontendUrl.toString(), 302);
}

