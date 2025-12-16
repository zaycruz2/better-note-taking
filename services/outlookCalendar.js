import { PublicClientApplication } from '@azure/msal-browser';

const DEFAULT_TENANT = 'common';
const SCOPES = ['User.Read', 'Calendars.Read'];

let msalInstance = null;
let msalAccount = null;

export const getStoredOutlookConfig = () => {
  if (typeof window === 'undefined') return { clientId: '', tenantId: '' };
  return {
    clientId: localStorage.getItem('ms_client_id') || '',
    tenantId: localStorage.getItem('ms_tenant_id') || DEFAULT_TENANT
  };
};

export const saveOutlookConfig = (clientId, tenantId) => {
  localStorage.setItem('ms_client_id', clientId || '');
  localStorage.setItem('ms_tenant_id', tenantId || DEFAULT_TENANT);
  // Reset instance so a changed config takes effect
  msalInstance = null;
  msalAccount = null;
};

const getMsalInstance = () => {
  if (msalInstance) return msalInstance;
  const { clientId, tenantId } = getStoredOutlookConfig();
  if (!clientId) return null;

  msalInstance = new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId || DEFAULT_TENANT}`,
      redirectUri: window.location.origin
    },
    cache: {
      cacheLocation: 'localStorage'
    }
  });

  return msalInstance;
};

export const getOutlookConnectionState = async () => {
  const app = getMsalInstance();
  if (!app) return { connected: false, reason: 'not_configured' };

  const accounts = app.getAllAccounts();
  if (accounts.length > 0) {
    msalAccount = accounts[0];
    return { connected: true };
  }
  return { connected: false, reason: 'not_authenticated' };
};

export const connectOutlook = async () => {
  const app = getMsalInstance();
  if (!app) throw new Error('Microsoft Client ID not configured.');

  const result = await app.loginPopup({
    scopes: SCOPES,
    prompt: 'select_account'
  });

  msalAccount = result.account || null;
  return { connected: !!msalAccount };
};

const acquireAccessToken = async () => {
  const app = getMsalInstance();
  if (!app) throw new Error('Microsoft Client ID not configured.');

  if (!msalAccount) {
    const accounts = app.getAllAccounts();
    msalAccount = accounts[0] || null;
  }

  if (!msalAccount) {
    await connectOutlook();
  }

  try {
    const resp = await app.acquireTokenSilent({
      scopes: SCOPES,
      account: msalAccount
    });
    return resp.accessToken;
  } catch {
    const resp = await app.acquireTokenPopup({
      scopes: SCOPES,
      prompt: 'select_account'
    });
    msalAccount = resp.account || msalAccount;
    return resp.accessToken;
  }
};

export const formatOutlookEvent = (event, dateStr) => {
  const subject = event?.subject || '(No title)';

  const startDateTime = event?.start?.dateTime;
  const isAllDay = !!event?.isAllDay || !startDateTime;

  if (isAllDay) return `All Day - ${subject}`;

  // Graph returns ISO without timezone sometimes; Date(...) handles offset when present.
  const d = new Date(startDateTime);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${time} - ${subject}`;
};

export const getOutlookEventsForDate = async (dateStr) => {
  const { clientId } = getStoredOutlookConfig();
  if (!clientId) {
    console.warn('Outlook not configured; returning mock events.');
    return [
      `09:00 AM - [MOCK] Outlook Standup (${dateStr})`,
      `01:00 PM - [MOCK] Outlook 1:1`,
      `All Day - [MOCK] Outlook Focus Time`
    ];
  }

  const token = await acquireAccessToken();

  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59`);

  const url =
    `https://graph.microsoft.com/v1.0/me/calendarView` +
    `?startDateTime=${encodeURIComponent(start.toISOString())}` +
    `&endDateTime=${encodeURIComponent(end.toISOString())}` +
    `&$select=subject,start,end,isAllDay`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Outlook fetch failed (${resp.status}): ${text || resp.statusText}`);
  }

  const data = await resp.json();
  const events = Array.isArray(data?.value) ? data.value : [];
  return events.map((ev) => formatOutlookEvent(ev, dateStr));
};



