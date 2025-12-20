import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { ProjectRecord, ProjectStatus } from '../types';
import { getProjectNoteDatesChronological, insertProjectNoteDate } from '../utils/projectNotes';

const STATUS_ORDER: ProjectStatus[] = ['active', 'shipped', 'paused', 'killed'];
const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'ACTIVE',
  shipped: 'SHIPPED',
  paused: 'PAUSED',
  killed: 'KILLED',
};

function statusColor(status: ProjectStatus): string {
  switch (status) {
    case 'active':
      return 'border-blue-400 bg-blue-50/50';
    case 'shipped':
      return 'border-green-400 bg-green-50/50';
    case 'paused':
      return 'border-amber-400 bg-amber-50/50';
    case 'killed':
      return 'border-gray-300 bg-gray-50';
  }
}

function truncate(s: string, max: number): string {
  const t = (s || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

type EditDraft = {
  id?: string;
  name: string;
  description: string;
  status: ProjectStatus;
  blocking_or_reason: string;
  notes: string;
};

function draftFromProject(p?: ProjectRecord): EditDraft {
  return {
    id: p?.id,
    name: p?.name || '',
    description: p?.description || '',
    status: p?.status || 'active',
    blocking_or_reason: p?.blocking_or_reason || '',
    notes: p?.notes || '',
  };
}

export default function ProjectsBoard(props: {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  projects: ProjectRecord[];
  byStatus: Record<ProjectStatus, ProjectRecord[]>;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  onRefresh: () => void | Promise<void>;
  onCreate: (input: { name: string; description?: string; status?: ProjectStatus; blocking_or_reason?: string; notes?: string }) => Promise<ProjectRecord>;
  onUpdate: (id: string, patch: Partial<ProjectRecord>) => Promise<ProjectRecord>;
  onRemove: (id: string) => Promise<void>;
}) {
  const { enabled, loading, error, projects, byStatus, selectedProjectId, onSelectProject, onRefresh, onCreate, onUpdate, onRemove } = props;

  const [collapsed, setCollapsed] = useState<Record<ProjectStatus, boolean>>({
    active: false,
    shipped: true,
    paused: true,
    killed: true,
  });

  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusPrompt, setStatusPrompt] = useState<{ id: string; next: ProjectStatus } | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [insertDateDraft, setInsertDateDraft] = useState(() => new Date().toISOString().slice(0, 10));

  const openNew = () => {
    setEditing(draftFromProject());
    setInsertDateDraft(new Date().toISOString().slice(0, 10));
  };
  const openEdit = (p: ProjectRecord) => {
    setEditing(draftFromProject(p));
    setInsertDateDraft(new Date().toISOString().slice(0, 10));
  };

  const submitEdit = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;

    const requiresReason = editing.status === 'paused' || editing.status === 'killed';
    const reason = editing.blocking_or_reason.trim();
    if (requiresReason && !reason) return;

    setSaving(true);
    try {
      if (editing.id) {
        await onUpdate(editing.id, {
          name,
          description: editing.description.trim() || null,
          status: editing.status,
          blocking_or_reason: reason || null,
          notes: editing.notes,
        });
      } else {
        await onCreate({
          name,
          description: editing.description.trim() || undefined,
          status: editing.status,
          blocking_or_reason: reason || undefined,
          notes: editing.notes,
        });
      }
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => STATUS_ORDER.map((s) => [s, byStatus[s]] as const), [byStatus]);

  return (
    <div className="h-full w-full overflow-y-auto p-8 space-y-4 bg-white font-sans">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="text-2xl font-bold text-gray-900">Projects</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRefresh()}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600"
            title="Refresh"
            disabled={!enabled || loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm font-medium"
            disabled={!enabled}
            title={!enabled ? 'Enable Supabase to use Projects' : 'New project'}
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      {!enabled && (
        <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
          Projects require Supabase auth/sync to be configured.
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {grouped.map(([status, items]) => {
        const isCollapsed = collapsed[status];
        return (
          <div key={status} className={`p-4 rounded-r-lg shadow-sm border-l-4 ${statusColor(status)}`}>
            <button
              type="button"
              className="w-full flex items-center justify-between"
              onClick={() => setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }))}
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                <div className="text-xs font-bold tracking-wide text-gray-700">
                  {STATUS_LABEL[status]} ({items.length})
                </div>
              </div>
            </button>

            {!isCollapsed && (
              <div className="mt-3 space-y-3">
                {items.length === 0 && <div className="text-xs text-gray-400 italic">Empty</div>}
                {items.map((p) => {
                  const desc = (p.description || '').trim();
                  const reason = (p.blocking_or_reason || '').trim();
                  const hasReason = !!reason && (p.status === 'active' || p.status === 'paused' || p.status === 'killed');
                  const reasonLabel =
                    p.status === 'active' ? 'blocking' : p.status === 'paused' ? 'paused' : p.status === 'killed' ? 'killed' : 'note';

                  return (
                    <div
                      key={p.id}
                      className={`bg-white rounded-lg border p-4 hover:shadow-sm transition-shadow cursor-pointer ${
                        selectedProjectId === p.id ? 'border-gray-900' : 'border-gray-200'
                      }`}
                      onClick={() => {
                        if (onSelectProject) onSelectProject(p.id);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{p.name}</div>
                          {desc && <div className="text-sm text-gray-600 mt-1">{truncate(desc, 90)}</div>}
                          {hasReason && (
                            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 mt-2 inline-flex items-center gap-2">
                              <AlertTriangle className="w-3 h-3" />
                              <span className="font-mono">{reasonLabel}:</span> {truncate(reason, 120)}
                            </div>
                          )}
                          {p.status === 'shipped' && (
                            <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-md px-2 py-1 mt-2 inline-flex items-center gap-2">
                              <CheckCircle2 className="w-3 h-3" />
                              Shipped
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            className="p-1 rounded hover:bg-gray-100 text-gray-500"
                            title="Edit project"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(p);
                            }}
                            disabled={!enabled}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <select
                            value={p.status}
                            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const next = e.target.value as ProjectStatus;
                              if (next === p.status) return;
                              if (next === 'paused' || next === 'killed') {
                                setStatusPrompt({ id: p.id, next });
                                setStatusReason('');
                                return;
                              }
                              onUpdate(p.id, { status: next, blocking_or_reason: null }).catch(() => null);
                            }}
                            disabled={!enabled}
                          >
                            {STATUS_ORDER.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s].toLowerCase()}
                              </option>
                            ))}
                          </select>

                          <button
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600"
                            title="Delete project"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete project "${p.name}"?`)) onRemove(p.id).catch(() => null);
                            }}
                            disabled={!enabled}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Status reason prompt */}
      {statusPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="font-bold text-gray-900">Add a reason</div>
              <div className="text-xs text-gray-500 mt-1">
                {statusPrompt.next === 'paused' ? 'Why is this project paused?' : 'Why is this project killed?'}
              </div>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="w-full min-h-[96px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Short reason…"
              />
              <div className="flex gap-3">
                <button
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
                  onClick={() => setStatusPrompt(null)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors text-sm font-medium"
                  onClick={async () => {
                    const reason = statusReason.trim();
                    if (!reason) return;
                    await onUpdate(statusPrompt.id, { status: statusPrompt.next, blocking_or_reason: reason });
                    setStatusPrompt(null);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div className="font-bold text-gray-900">{editing.id ? 'Edit project' : 'New project'}</div>
              <button className="text-gray-400 hover:text-gray-700" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column: project fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Name</label>
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="e.g. AssistantOS"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Description</label>
                  <textarea
                    value={editing.description}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                    className="w-full min-h-[80px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="One-liner about the project…"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Status</label>
                    <select
                      value={editing.status}
                      onChange={(e) => setEditing((prev) => (prev ? { ...prev, status: e.target.value as ProjectStatus } : prev))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s].toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {(editing.status === 'active' || editing.status === 'paused' || editing.status === 'killed') && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      {editing.status === 'active' ? 'Blocking' : 'Reason'}
                    </label>
                    <input
                      value={editing.blocking_or_reason}
                      onChange={(e) => setEditing((prev) => (prev ? { ...prev, blocking_or_reason: e.target.value } : prev))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      placeholder={editing.status === 'active' ? 'What’s blocking this?' : 'Why?'}
                    />
                  </div>
                )}
              </div>

              {/* Right column: project notes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-800">Project notes</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={insertDateDraft}
                      onChange={(e) => setInsertDateDraft(e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                    />
                    <button
                      type="button"
                      className="px-2 py-1 text-xs rounded bg-gray-900 text-white hover:bg-gray-800"
                      onClick={() => {
                        const dateStr = insertDateDraft;
                        const cursor = notesRef.current?.selectionStart ?? 0;
                        const res = insertProjectNoteDate({ notes: editing.notes, dateStr, cursor });
                        setEditing((prev) => (prev ? { ...prev, notes: res.notes } : prev));
                        requestAnimationFrame(() => {
                          const el = notesRef.current;
                          if (!el) return;
                          el.focus();
                          el.setSelectionRange(res.cursor, res.cursor);
                        });
                      }}
                      disabled={!insertDateDraft}
                      title="Insert date header"
                    >
                      Insert date
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
                  <textarea
                    ref={notesRef}
                    value={editing.notes}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
                    className="w-full min-h-[260px] px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder={`2025-12-19\n========================================\nDid X\n\n2025-12-20\n========================================\nDid Y`}
                    spellCheck={false}
                  />

                  <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                    <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
                      Timeline
                    </div>
                    <div className="space-y-1 max-h-[260px] overflow-y-auto">
                      {getProjectNoteDatesChronological(editing.notes).length === 0 ? (
                        <div className="text-xs text-gray-400 italic">No dates yet</div>
                      ) : (
                        getProjectNoteDatesChronological(editing.notes).map((d) => (
                          <button
                            key={d}
                            type="button"
                            className="w-full text-left text-xs px-2 py-1 rounded hover:bg-white"
                            onClick={() => {
                              const idx = editing.notes.search(new RegExp(`^${d}$`, 'm'));
                              if (idx === -1) return;
                              requestAnimationFrame(() => {
                                const el = notesRef.current;
                                if (!el) return;
                                el.focus();
                                el.setSelectionRange(idx, idx);
                              });
                            }}
                            title={`Jump to ${d}`}
                          >
                            {d}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 flex gap-3 pt-2">
                <button
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
                  onClick={() => setEditing(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
                  onClick={submitEdit}
                  disabled={saving || !enabled}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 mt-2">
        {enabled ? `${projects.length} total` : ''}
      </div>
    </div>
  );
}

