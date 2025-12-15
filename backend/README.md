# MonoFocus OAuth Backend

A Cloudflare Worker that handles OAuth flows for Google Calendar and Microsoft Outlook, so users can just click "Sign in" without needing to configure API keys.

## Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
2. [Node.js](https://nodejs.org/) 18+
3. Google Cloud Project with OAuth credentials
4. Microsoft Azure App Registration

## Setup

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Create OAuth Apps

#### Google Calendar

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the **Google Calendar API**
4. Go to **APIs & Services > Credentials**
5. Create **OAuth 2.0 Client ID** (Web application)
6. Add authorized redirect URI: `https://YOUR-WORKER.workers.dev/auth/google/callback`
7. Note your **Client ID** and **Client Secret**

#### Microsoft Outlook

1. Go to [Azure Portal > App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Name: "MonoFocus Calendar"
4. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
5. Redirect URI: **Web** > `https://YOUR-WORKER.workers.dev/auth/microsoft/callback`
6. After creation, go to **Certificates & secrets** > **New client secret**
7. Note your **Application (client) ID** and **Client Secret**
8. Go to **API permissions** > Add:
   - Microsoft Graph > Delegated > `Calendars.Read`
   - Microsoft Graph > Delegated > `User.Read`

### 3. Configure secrets

```bash
# Set secrets (will prompt for values)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET
```

### 4. Update wrangler.toml

Edit `wrangler.toml` and set your frontend URL:

```toml
[vars]
FRONTEND_URL = "https://your-frontend-domain.com"
```

For local development, keep it as `http://localhost:3000`.

### 5. Deploy

```bash
npm run deploy
```

This will output your worker URL (e.g., `https://monofocus-oauth.YOUR-SUBDOMAIN.workers.dev`).

### 6. Update frontend

Set the `VITE_BACKEND_URL` environment variable in your frontend:

```bash
# In the root project directory, create .env.local
echo "VITE_BACKEND_URL=https://monofocus-oauth.YOUR-SUBDOMAIN.workers.dev" > ../.env.local
```

## Local Development

Run the worker locally:

```bash
npm run dev
```

This starts the worker on `http://localhost:8787`.

Make sure your frontend is configured to use this URL during development.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /auth/google` | Start Google OAuth flow |
| `GET /auth/google/callback` | Google OAuth callback |
| `GET /auth/microsoft` | Start Microsoft OAuth flow |
| `GET /auth/microsoft/callback` | Microsoft OAuth callback |
| `GET /api/google/events?date=YYYY-MM-DD` | Fetch Google Calendar events |
| `GET /api/microsoft/events?date=YYYY-MM-DD` | Fetch Microsoft Calendar events |
| `GET /health` | Health check |

## Troubleshooting

### "redirect_uri_mismatch" error
Make sure the redirect URI in your OAuth app settings exactly matches:
- Google: `https://YOUR-WORKER.workers.dev/auth/google/callback`
- Microsoft: `https://YOUR-WORKER.workers.dev/auth/microsoft/callback`

### CORS errors
Check that `FRONTEND_URL` in `wrangler.toml` matches your frontend's origin exactly.

### Token expired
Access tokens expire after ~1 hour. The frontend will detect this and prompt re-authentication.

