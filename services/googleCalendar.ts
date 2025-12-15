// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

// Authorization scopes required by the API
const SCOPES = 'https://www.googleapis.com/auth/calendar.events.readonly';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export const getStoredConfig = () => {
  if (typeof window === 'undefined') return { clientId: '', apiKey: '' };
  return {
    clientId: localStorage.getItem('google_client_id') || '',
    apiKey: localStorage.getItem('google_api_key') || ''
  };
};

export const saveConfig = (clientId: string, apiKey: string) => {
  localStorage.setItem('google_client_id', clientId);
  localStorage.setItem('google_api_key', apiKey);
};

export const initGoogleClient = async () => {
  const { clientId, apiKey } = getStoredConfig();

  // If no credentials, we can't init, but we don't reject hard to allow app to load
  if (!clientId || !apiKey || clientId.includes('YOUR_CLIENT')) {
    console.log("Google Client ID/API Key not configured in Settings.");
    return;
  }

  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Window not defined'));
    
    // @ts-ignore
    if (window.gapi) {
        // @ts-ignore
        window.gapi.load('client', async () => {
        try {
            // @ts-ignore
            await window.gapi.client.init({
            apiKey: apiKey,
            discoveryDocs: [DISCOVERY_DOC],
            });
            gapiInited = true;
            checkAuth(resolve);
        } catch (err: any) {
            const msg = err?.result?.error?.message || err?.message || JSON.stringify(err);
            console.warn(`GAPI Init Failed: ${msg}`);
            // Don't reject here to avoid crashing app loop, just log
            resolve(); 
        }
        });
    }

    // @ts-ignore
    if (window.google) {
        try {
            // @ts-ignore
            tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: '', // defined later
            });
            gisInited = true;
            checkAuth(resolve);
        } catch (e) {
            console.warn("GIS Init Failed", e);
            resolve();
        }
    }
  });
};

const checkAuth = (resolve: () => void) => {
  if (gapiInited && gisInited) {
    resolve();
  }
};

export const handleAuthClick = async () => {
  const { clientId } = getStoredConfig();
  if (!clientId) throw new Error("Please configure Google Client ID in Settings first.");

  return new Promise<void>((resolve, reject) => {
    if (!tokenClient) {
        // Try to re-init if missed
        initGoogleClient().then(() => {
            if (!tokenClient) return reject(new Error('Google Client could not be initialized. Check API Key/Client ID.'));
            triggerAuth(resolve, reject);
        });
    } else {
        triggerAuth(resolve, reject);
    }
  });
};

const triggerAuth = (resolve: () => void, reject: (err: any) => void) => {
    if (!tokenClient) return reject(new Error("Token Client missing"));

    tokenClient.callback = async (resp: any) => {
      if (resp.error !== undefined) {
        const errMsg = resp.error_description || resp.error || JSON.stringify(resp);
        reject(new Error(errMsg));
        return;
      }
      resolve();
    };

    if (!(window as any).gapi || !(window as any).gapi.client) {
         return reject(new Error("GAPI client not initialized. Check your network connection."));
    }

    const token = (window as any).gapi.client.getToken();
    if (token === null) {
      tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
      tokenClient.requestAccessToken({prompt: ''});
    }
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

    if (!(window as any).gapi || !(window as any).gapi.client) {
        // Try one last init attempt
        await initGoogleClient();
        if (!(window as any).gapi?.client?.calendar) {
            throw new Error("Google API not initialized. Please connect in Settings.");
        }
    }

    const timeMin = new Date(dateStr + 'T00:00:00').toISOString();
    const timeMax = new Date(dateStr + 'T23:59:59').toISOString();

    const response = await (window as any).gapi.client.calendar.events.list({
      'calendarId': 'primary',
      'timeMin': timeMin,
      'timeMax': timeMax,
      'showDeleted': false,
      'singleEvents': true,
      'orderBy': 'startTime',
    });

    const events = response.result.items;
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
    const msg = err?.result?.error?.message || err?.message || "Failed to fetch events (Unknown error)";
    throw new Error(msg);
  }
};
