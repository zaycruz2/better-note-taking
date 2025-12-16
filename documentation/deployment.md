# Deployment Guide

This guide covers deploying MonoFocus for public access.

## Architecture Overview

```
                    +------------------+
                    |   Supabase       |
                    |  - Auth          |
                    |  - Postgres DB   |
                    +--------+---------+
                             |
+------------+      +--------+---------+      +------------------+
|  Browser   | ---> |  Frontend        | ---> |  Cloudflare      |
|  (User)    |      |  (Cloudflare     |      |  Worker          |
|            |      |   Pages)         |      |  (Calendar OAuth)|
+------------+      +------------------+      +------------------+
                                                      |
                                              +-------+-------+
                                              |               |
                                          Google API    Microsoft API
```

## Prerequisites

1. **Supabase project** configured per `documentation/supabase-setup.md`
2. **Cloudflare account** (free tier works)
3. **Google Cloud project** with Calendar API enabled and OAuth credentials
4. (Optional) **Microsoft Azure app registration** for Outlook calendar

## Step 1: Deploy the Frontend (Cloudflare Pages)

### Option A: Via Wrangler CLI

```bash
# Build the frontend
npm run build

# Deploy to Pages (first time creates the project)
npx wrangler pages deploy dist --project-name monofocus
```

### Option B: Via GitHub Integration

1. Push your repo to GitHub.
2. Go to Cloudflare Dashboard > Pages > Create a project.
3. Connect your GitHub repo.
4. Set build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Add environment variables:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
   - `VITE_BACKEND_URL` = your Worker URL (after deploying in Step 2)

Note: You can get your Pages URL after deployment (e.g., `https://monofocus.pages.dev`).

## Step 2: Deploy the Worker (Cloudflare Workers)

```bash
cd backend

# Set secrets (will prompt for values)
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put MICROSOFT_CLIENT_ID      # if using Outlook
npx wrangler secret put MICROSOFT_CLIENT_SECRET  # if using Outlook

# Update wrangler.toml with your frontend URL
# FRONTEND_URL = "https://monofocus.pages.dev"

# Deploy
npm run deploy
```

Your Worker URL will be something like `https://monofocus-oauth.<your-subdomain>.workers.dev`.

## Step 3: Update OAuth Redirect URIs

### Google Cloud Console

1. Go to APIs & Services > Credentials.
2. Edit your OAuth 2.0 Client ID.
3. Add authorized redirect URI:
   - `https://monofocus-oauth.<your-subdomain>.workers.dev/auth/google/callback`

### Microsoft Azure (if using Outlook)

1. Go to Azure Portal > App registrations > Your app.
2. Under Authentication > Redirect URIs, add:
   - `https://monofocus-oauth.<your-subdomain>.workers.dev/auth/microsoft/callback`

## Step 4: Update Supabase Redirect URLs

1. Go to Supabase Dashboard > Authentication > URL Configuration.
2. Add your frontend URL to **Redirect URLs**:
   - `https://monofocus.pages.dev`

## Step 5: Update Frontend Environment

After deploying both services, update the frontend's environment variables:

1. In Cloudflare Pages dashboard, go to your project > Settings > Environment variables.
2. Set `VITE_BACKEND_URL` to your Worker URL.
3. Trigger a redeploy (or push a new commit).

## Environment Variables Summary

### Frontend (Cloudflare Pages)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous API key |
| `VITE_BACKEND_URL` | Cloudflare Worker URL |

### Backend (Cloudflare Worker)

| Variable | Type | Description |
|----------|------|-------------|
| `FRONTEND_URL` | var | Frontend URL for CORS |
| `MICROSOFT_TENANT` | var | Microsoft tenant (default: "common") |
| `GOOGLE_CLIENT_ID` | secret | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | secret | Google OAuth client secret |
| `MICROSOFT_CLIENT_ID` | secret | Microsoft OAuth client ID |
| `MICROSOFT_CLIENT_SECRET` | secret | Microsoft OAuth client secret |

## Custom Domain (Optional)

### For Cloudflare Pages

1. Go to Pages project > Custom domains.
2. Add your domain (e.g., `app.yourdomain.com`).
3. Update DNS records as instructed.
4. Update all redirect URIs in OAuth providers.
5. Update `FRONTEND_URL` in the Worker.

### For Cloudflare Worker

1. Go to Workers > your worker > Triggers > Custom Domains.
2. Add your domain (e.g., `api.yourdomain.com`).
3. Update all redirect URIs in OAuth providers.
4. Update `VITE_BACKEND_URL` in the frontend.

## Verification Checklist

After deployment:

- [ ] Frontend loads at your Pages URL
- [ ] Anonymous auth works (user gets a session automatically)
- [ ] Google sign-in redirects and completes successfully
- [ ] Email sign-up sends confirmation email
- [ ] Notes sync to Supabase (check the `notes` table)
- [ ] Calendar sync works (Google Calendar import)
- [ ] CORS errors do not appear in browser console

## Troubleshooting

### "redirect_uri_mismatch" error
The redirect URI in your OAuth provider settings must exactly match what the Worker sends. Check:
- `https://your-worker.workers.dev/auth/google/callback` (trailing slash matters)

### CORS errors
Ensure `FRONTEND_URL` in `wrangler.toml` exactly matches your deployed frontend origin (no trailing slash).

### Supabase auth redirect issues
Ensure your frontend URL is in the Supabase Redirect URLs list.

### Notes not syncing
- Check browser console for errors.
- Verify RLS policies are set up correctly.
- Check Supabase logs for database errors.


