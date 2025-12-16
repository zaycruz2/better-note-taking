# Supabase Setup Guide

This guide walks you through setting up Supabase for MonoFocus authentication and note storage.

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New Project**.
3. Choose an organization, name your project (e.g., `monofocus`), set a database password, and select a region.
4. Wait for the project to provision (1-2 minutes).

## 2. Enable Authentication Providers

Go to **Authentication > Providers** in your Supabase dashboard.

### Enable Anonymous Sign-ins
1. Find **Anonymous** in the provider list.
2. Toggle it **ON**.

### Enable Google OAuth (recommended for account upgrade)
1. Find **Google** in the provider list.
2. Toggle it **ON**.
3. You will need:
   - **Client ID** and **Client Secret** from [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
   - Create an OAuth 2.0 Client ID (Web application).
   - Add authorized redirect URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
4. Paste the credentials into Supabase.

### (Optional) Enable Email/Password
1. Find **Email** in the provider list.
2. Toggle it **ON**.
3. Configure confirmation emails if desired.

## 3. Create the Notes Table

Go to **SQL Editor** in your Supabase dashboard and run:

```sql
-- Create notes table (1 row per user)
CREATE TABLE IF NOT EXISTS public.notes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own notes
CREATE POLICY "Users can view own notes"
  ON public.notes
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own notes
CREATE POLICY "Users can insert own notes"
  ON public.notes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own notes
CREATE POLICY "Users can update own notes"
  ON public.notes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for faster lookups (optional, user_id is already PK)
-- CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
```

## 4. Get Your API Keys

Go to **Settings > API** in your Supabase dashboard.

Copy:
- **Project URL** (e.g., `https://xxxxx.supabase.co`)
- **anon public** key (the public API key)

## 5. Configure the Frontend

Create a `.env.local` file in the project root (or update existing):

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...your-anon-key
```

Replace with your actual values from step 4.

## 6. Configure Auth Redirect URLs

Go to **Authentication > URL Configuration** in Supabase.

Add your frontend URLs to **Redirect URLs**:
- For local dev: `http://localhost:3000`
- For production: `https://your-domain.com`

## Security Notes

- The `anon` key is safe to expose in the frontend; RLS policies protect data.
- Anonymous sessions are tied to the browser; clearing storage loses the session.
- Users must upgrade to a real account (Google/Email) to sync across devices.


