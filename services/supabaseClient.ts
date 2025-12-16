import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { isEmptyTemplate } from '../utils/constants';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

// Singleton client
let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('Supabase URL or anon key not configured. Cloud sync disabled.');
    }
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseInstance;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// ===== Auth Helpers =====

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user;
}

export function isAnonymousUser(user: User | null): boolean {
  if (!user) return false;
  return user.is_anonymous === true;
}

export async function signInAnonymously(): Promise<{ user: User | null; error: Error | null }> {
  const { data, error } = await getSupabase().auth.signInAnonymously();
  return { user: data.user, error: error as Error | null };
}

export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  return { error: error as Error | null };
}

export async function signInWithEmail(email: string, password: string): Promise<{ user: User | null; error: Error | null }> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  return { user: data.user, error: error as Error | null };
}

export async function signUpWithEmail(email: string, password: string): Promise<{ user: User | null; error: Error | null }> {
  const { data, error } = await getSupabase().auth.signUp({ email, password });
  return { user: data.user, error: error as Error | null };
}

export async function signOut(): Promise<{ error: Error | null }> {
  const { error } = await getSupabase().auth.signOut();
  return { error: error as Error | null };
}

// ===== Notes Storage =====

export interface NoteRecord {
  user_id: string;
  content: string;
  updated_at: string;
}

export async function fetchNote(userId: string): Promise<NoteRecord | null> {
  const { data, error } = await getSupabase()
    .from('notes')
    .select('user_id, content, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('fetchNote error:', error);
    throw new Error(error.message);
  }

  return data as NoteRecord | null;
}

export async function upsertNote(userId: string, content: string): Promise<NoteRecord> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from('notes')
    .upsert(
      { user_id: userId, content, updated_at: now },
      { onConflict: 'user_id' }
    )
    .select('user_id, content, updated_at')
    .single();

  if (error) {
    console.error('upsertNote error:', error);
    throw new Error(error.message);
  }

  return data as NoteRecord;
}

// ===== Merge Logic (reused from cloudSync) =====

export function resolveInitialContent({
  localContent,
  localUpdatedAt,
  remoteContent,
  remoteUpdatedAt,
}: {
  localContent: string;
  localUpdatedAt: number;
  remoteContent: string;
  remoteUpdatedAt: number;
}): { source: 'none' | 'local' | 'remote'; content: string; updatedAt: number } {
  // Treat empty templates as having no real content
  // This prevents a fresh template from overriding real cloud notes
  const localIsEmpty = !localContent || isEmptyTemplate(localContent);
  const remoteIsEmpty = !remoteContent || isEmptyTemplate(remoteContent);

  const hasRemote = !remoteIsEmpty;
  const hasLocal = !localIsEmpty;

  if (!hasRemote && !hasLocal) {
    return { source: 'none', content: '', updatedAt: 0 };
  }
  if (hasRemote && !hasLocal) {
    return { source: 'remote', content: remoteContent, updatedAt: remoteUpdatedAt || 0 };
  }
  if (!hasRemote && hasLocal) {
    return { source: 'local', content: localContent, updatedAt: localUpdatedAt || 0 };
  }

  // Both have real content: choose the newer one.
  if (remoteUpdatedAt > localUpdatedAt) {
    return { source: 'remote', content: remoteContent, updatedAt: remoteUpdatedAt };
  }
  return { source: 'local', content: localContent, updatedAt: localUpdatedAt };
}


