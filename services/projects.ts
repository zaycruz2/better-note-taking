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

export async function fetchProjects(userId: string): Promise<ProjectRecord[]> {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('id, user_id, name, description, status, blocking_or_reason, notes, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw normalizeSupabaseError(error);
  return (data || []) as ProjectRecord[];
}

export async function createProject(input: ProjectUpsertInput): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const payload = {
    user_id: input.user_id,
    name: input.name,
    description: input.description ?? null,
    status: input.status ?? 'active',
    blocking_or_reason: input.blocking_or_reason ?? null,
    notes: input.notes ?? null,
    updated_at: now,
  };

  const { data, error } = await getSupabase()
    .from('projects')
    .insert(payload)
    .select('id, user_id, name, description, status, blocking_or_reason, notes, created_at, updated_at')
    .single();

  if (error) throw normalizeSupabaseError(error);
  return data as ProjectRecord;
}

export async function updateProject(id: string, patch: ProjectUpdateInput): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from('projects')
    .update({ ...patch, updated_at: now })
    .eq('id', id)
    .select('id, user_id, name, description, status, blocking_or_reason, notes, created_at, updated_at')
    .single();

  if (error) throw normalizeSupabaseError(error);
  return data as ProjectRecord;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await getSupabase().from('projects').delete().eq('id', id);
  if (error) throw normalizeSupabaseError(error);
}

