// OAuth-only Google Calendar integration:
// We use Google Identity Services to obtain an access token, then call the Calendar REST API via fetch.
const SCOPES = 'https://www.googleapis.com/auth/calendar.events.readonly';

let tokenClient: any;
let accessToken: string | null = null;
let accessTokenExpiresAt: number | null = null;

export const getStoredConfig = () => {
  if (typeof window === 'undefined') return { clientId: '' };
  return {
    clientId: localStorage.getItem('google_client_id') || ''
  };
};

export const saveConfig = (clientId: string) => {
  localStorage.setItem('google_client_id', clientId);
  // Back-compat cleanup: we no longer use this.
  localStorage.removeItem('google_api_key');
};

export const initGoogleClient = async () => {
  const { clientId } = getStoredConfig();

  // If no credentials, we can't init, but we don't reject hard to allow app to load
  if (!clientId || clientId.includes('YOUR_CLIENT')) {
    console.log("Google Client ID not configured in Settings.");
    return;
  }

  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Window not defined'));

    // @ts-ignore
    if (window.google) {
        try {
            // @ts-ignore
            tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: '', // defined later
            });
            resolve();
        } catch (e) {
            console.warn("GIS Init Failed", e);
            resolve();
        }
    }
  });
};

export const handleAuthClick = async () => {
  const { clientId } = getStoredConfig();
  if (!clientId) throw new Error("Please configure Google Client ID in Settings first.");

  return new Promise<void>((resolve, reject) => {
    if (!tokenClient) {
        // Try to re-init if missed
        initGoogleClient().then(() => {
            if (!tokenClient) return reject(new Error('Google Client could not be initialized. Check Client ID.'));
            triggerAuth(resolve, reject, 'consent');
        });
    } else {
        triggerAuth(resolve, reject, 'consent');
    }
  });
};

const triggerAuth = (resolve: () => void, reject: (err: any) => void, prompt: '' | 'consent') => {
    if (!tokenClient) return reject(new Error("Token Client missing"));

    tokenClient.callback = async (resp: any) => {
      if (resp.error !== undefined) {
        const errMsg = resp.error_description || resp.error || JSON.stringify(resp);
        reject(new Error(errMsg));
        return;
      }
      // GIS token response includes access_token and expires_in (seconds)
      if (resp.access_token) {
        accessToken = resp.access_token;
        const expiresIn = typeof resp.expires_in === 'number' ? resp.expires_in : 3600;
        // Refresh a minute early
        accessTokenExpiresAt = Date.now() + expiresIn * 1000 - 60_000;
      }
      resolve();
    };

    tokenClient.requestAccessToken({ prompt });
};

const ensureAccessToken = async () => {
  const { clientId } = getStoredConfig();
  if (!clientId) throw new Error("Please configure Google Client ID in Settings first.");

  if (accessToken && accessTokenExpiresAt && Date.now() < accessTokenExpiresAt) return accessToken;

  // Try silent refresh first (may still prompt depending on browser/session)
  await new Promise<void>((resolve, reject) => {
    if (!tokenClient) {
      initGoogleClient().then(() => {
        if (!tokenClient) return reject(new Error('Google Client could not be initialized. Check Client ID.'));
        triggerAuth(resolve, reject, '');
      });
      return;
    }
    triggerAuth(resolve, reject, '');
  });

  if (!accessToken) {
    // Fallback to consent prompt
    await handleAuthClick();
  }

  if (!accessToken) throw new Error('Could not acquire Google access token.');
  return accessToken;
};

export const getEventsForDate = async (dateStr: string): Promise<string[]> => {
  try {
    const { clientId } = getStoredConfig();
    
    if (!clientId || clientId.includes('YOUR_CLIENT')) {
      // Mock data for demo if not configured
      console.warn("Returning mock data (Not configured)");
      return [
        `09:00 AM - [MOCK] Team Standup (${dateStr})`,
        `11:30 AM - [MOCK] Design Review`,
        `03:00 PM - [MOCK] Client Call`
      ];
    }

    const token = await ensureAccessToken();
    const timeMin = new Date(dateStr + 'T00:00:00').toISOString();
    const timeMax = new Date(dateStr + 'T23:59:59').toISOString();

    const url =
      `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?timeMin=${encodeURIComponent(timeMin)}` +
      `&timeMax=${encodeURIComponent(timeMax)}` +
      `&singleEvents=true` +
      `&orderBy=startTime` +
      `&showDeleted=false`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Google fetch failed (${resp.status}): ${text || resp.statusText}`);
    }

    const data = await resp.json();
    const events = data?.items;
    if (!events || events.length === 0) {
      return [];
    }

    return events.map((event: any) => {
      const start = event.start.dateTime || event.start.date;
      let timeString = '';
      if (start.includes('T')) {
          const dateObj = new Date(start);
          timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
          timeString = 'All Day';
      }
      return `${timeString} - ${event.summary}`;
    });

  } catch (err: any) {
    console.error("Error fetching events", err);
    const msg = err?.message || "Failed to fetch events (Unknown error)";
    throw new Error(msg);
  }
};
