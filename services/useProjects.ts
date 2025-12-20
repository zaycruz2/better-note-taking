import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectRecord, ProjectStatus } from '../types';
import { createProject, deleteProject, fetchProjects, updateProject } from './projects';

export function useProjects(params: { userId: string | null; enabled: boolean }) {
  const { userId, enabled } = params;

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchProjects(userId);
      setProjects(rows);
    } catch (e: any) {
      const msg = (e?.message || String(e)).toString();
      if (msg.toLowerCase().includes('projects.notes') && msg.toLowerCase().includes('does not exist')) {
        setError('Database is missing `projects.notes`. Run: ALTER TABLE public.projects ADD COLUMN notes text; then reload.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, userId]);

  useEffect(() => {
    refresh().catch(() => null);
  }, [refresh]);

  const create = useCallback(
    async (input: { name: string; description?: string; status?: ProjectStatus; blocking_or_reason?: string; notes?: string }) => {
      if (!userId) throw new Error('Not signed in');
      const created = await createProject({
        user_id: userId,
        name: input.name,
        description: input.description ?? null,
        status: input.status ?? 'active',
        blocking_or_reason: input.blocking_or_reason ?? null,
        notes: typeof input.notes === 'string' ? input.notes : null,
      });
      setProjects((prev) => [created, ...prev]);
      return created;
    },
    [userId]
  );

  const update = useCallback(async (id: string, patch: Partial<ProjectRecord>) => {
    const updated = await updateProject(id, patch);
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const byStatus = useMemo(() => {
    const groups: Record<ProjectStatus, ProjectRecord[]> = {
      active: [],
      shipped: [],
      paused: [],
      killed: [],
    };
    for (const p of projects) {
      groups[p.status]?.push(p);
    }
    return groups;
  }, [projects]);

  return { projects, byStatus, loading, error, refresh, create, update, remove };
}

