import { getSupabase } from './supabaseClient';
import type { ProjectRecord, ProjectStatus } from '../types';

export type ProjectUpsertInput = {
  user_id: string;
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  blocking_or_reason?: string | null;
  notes?: string | null;
};

export type ProjectUpdateInput = Partial<Pick<ProjectRecord, 'name' | 'description' | 'status' | 'blocking_or_reason' | 'notes'>>;

function normalizeSupabaseError(e: any): Error {
  const msg = e?.message || e?.error_description || String(e);
  return new Error(msg);
}

function isMissingNotesColumnError(e: any): boolean {
  const msg = (e?.message || '').toString().toLowerCase();
  // PostgREST typically returns messages like: "column projects.notes does not exist"
  return msg.includes('projects.notes') && msg.includes('does not exist');
}

function missingNotesColumnMigrationError(): Error {
  return new Error('Database is missing `projects.notes`. Run: ALTER TABLE public.projects ADD COLUMN notes text; then reload.');
}

const PROJECT_SELECT_WITH_NOTES =
  'id, user_id, name, description, status, blocking_or_reason, notes, created_at, updated_at';
const PROJECT_SELECT_NO_NOTES =
  'id, user_id, name, description, status, blocking_or_reason, created_at, updated_at';

export async function fetchProjects(userId: string): Promise<ProjectRecord[]> {
  const { data, error } = await getSupabase()
    .from('projects')
    .select(PROJECT_SELECT_WITH_NOTES)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    if (isMissingNotesColumnError(error)) {
      const fallback = await getSupabase()
        .from('projects')
        .select(PROJECT_SELECT_NO_NOTES)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (fallback.error) throw normalizeSupabaseError(fallback.error);
      // Back-compat: populate notes as null in-memory.
      return ((fallback.data || []) as any[]).map((p) => ({ ...p, notes: null })) as ProjectRecord[];
    }
    throw normalizeSupabaseError(error);
  }
  return (data || []) as ProjectRecord[];
}

export async function createProject(input: ProjectUpsertInput): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const wantsNotes = typeof input.notes === 'string' && input.notes.trim().length > 0;

  const payloadBase = {
    user_id: input.user_id,
    name: input.name,
    description: input.description ?? null,
    status: input.status ?? 'active',
    blocking_or_reason: input.blocking_or_reason ?? null,
    updated_at: now,
  };

  if (wantsNotes) {
    const payload = { ...payloadBase, notes: input.notes ?? null };
    const { data, error } = await getSupabase()
      .from('projects')
      .insert(payload)
      .select(PROJECT_SELECT_WITH_NOTES)
      .single();

    if (error) {
      if (isMissingNotesColumnError(error)) throw missingNotesColumnMigrationError();
      throw normalizeSupabaseError(error);
    }
    return data as ProjectRecord;
  }

  const { data, error } = await getSupabase()
    .from('projects')
    .insert(payloadBase)
    .select(PROJECT_SELECT_NO_NOTES)
    .single();

  if (error) throw normalizeSupabaseError(error);
  return ({ ...(data as any), notes: null }) as ProjectRecord;
}

export async function updateProject(id: string, patch: ProjectUpdateInput): Promise<ProjectRecord> {
  const now = new Date().toISOString();

  const patchHasNotes = Object.prototype.hasOwnProperty.call(patch || {}, 'notes');

  const { data, error } = await getSupabase()
    .from('projects')
    .update({ ...patch, updated_at: now })
    .eq('id', id)
    .select(PROJECT_SELECT_WITH_NOTES)
    .single();

  if (error) {
    if (isMissingNotesColumnError(error)) {
      // If the caller is trying to write notes, make it explicit that the DB needs migration.
      if (patchHasNotes) throw missingNotesColumnMigrationError();

      // Otherwise retry without notes so the rest of the app continues working.
      const { notes: _notes, ...patchWithoutNotes } = (patch || {}) as any;
      const fallback = await getSupabase()
        .from('projects')
        .update({ ...patchWithoutNotes, updated_at: now })
        .eq('id', id)
        .select(PROJECT_SELECT_NO_NOTES)
        .single();
      if (fallback.error) throw normalizeSupabaseError(fallback.error);
      return ({ ...(fallback.data as any), notes: null }) as ProjectRecord;
    }
    throw normalizeSupabaseError(error);
  }
  return data as ProjectRecord;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await getSupabase().from('projects').delete().eq('id', id);
  if (error) throw normalizeSupabaseError(error);
}

