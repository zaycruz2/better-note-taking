import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectRecord } from '../types';
import { getProjectNoteDatesChronological, insertProjectNoteDate } from '../utils/projectNotes';

export default function ProjectNotesPanel(props: {
  project: ProjectRecord | null;
  enabled: boolean;
  onUpdateNotes: (projectId: string, notes: string) => Promise<void>;
}) {
  const { project, enabled, onUpdateNotes } = props;

  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [insertDateDraft, setInsertDateDraft] = useState(() => new Date().toISOString().slice(0, 10));

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(project?.notes || '');
    setDirty(false);
    setSaveError(null);
    setInsertDateDraft(new Date().toISOString().slice(0, 10));
  }, [project?.id]);

  // Debounced auto-save
  useEffect(() => {
    if (!enabled) return;
    if (!project?.id) return;
    if (!dirty) return;

    const t = setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      try {
        await onUpdateNotes(project.id, draft);
        setDirty(false);
      } catch (e: any) {
        setSaveError(e?.message || String(e));
      } finally {
        setSaving(false);
      }
    }, 900);

    return () => clearTimeout(t);
  }, [draft, dirty, enabled, onUpdateNotes, project?.id]);

  const dates = useMemo(() => getProjectNoteDatesChronological(draft), [draft]);

  if (!project) {
    return (
      <div className="h-full w-full bg-paper p-8 font-sans">
        <div className="text-gray-500 text-sm">
          Select a project on the right to write notes.
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-paper">
      <div className="h-full w-full flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{project.name}</div>
            <div className="text-xs text-gray-500 truncate">Project notes</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              type="date"
              value={insertDateDraft}
              onChange={(e) => setInsertDateDraft(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
              disabled={!enabled}
            />
            <button
              type="button"
              className="px-2 py-1 text-xs rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
              disabled={!enabled || !insertDateDraft}
              onClick={() => {
                const cursor = textareaRef.current?.selectionStart ?? draft.length;
                const res = insertProjectNoteDate({ notes: draft, dateStr: insertDateDraft, cursor });
                setDraft(res.notes);
                setDirty(true);
                requestAnimationFrame(() => {
                  const el = textareaRef.current;
                  if (!el) return;
                  el.focus();
                  el.setSelectionRange(res.cursor, res.cursor);
                });
              }}
              title="Insert date header"
            >
              Insert date
            </button>

            <div className="text-xs text-gray-400 ml-2">
              {saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}
            </div>
          </div>
        </div>

        {saveError && (
          <div className="px-6 py-2 text-xs bg-red-50 text-red-700 border-b border-red-100">
            {saveError}
          </div>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_200px]">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            readOnly={!enabled}
            className="w-full h-full p-6 font-mono text-sm md:text-base leading-relaxed resize-none outline-none text-ink bg-transparent selection:bg-yellow-200"
            spellCheck={false}
            placeholder={`2025-12-19\n========================================\nDid X\n\n2025-12-20\n========================================\nDid Y`}
          />

          <div className="border-l border-gray-200 bg-white p-4 overflow-y-auto">
            <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Timeline
            </div>
            {dates.length === 0 ? (
              <div className="text-xs text-gray-400 italic">No dates yet</div>
            ) : (
              <div className="space-y-1">
                {dates.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                    onClick={() => {
                      const idx = draft.search(new RegExp(`^${d}$`, 'm'));
                      if (idx === -1) return;
                      requestAnimationFrame(() => {
                        const el = textareaRef.current;
                        if (!el) return;
                        el.focus();
                        el.setSelectionRange(idx, idx);
                      });
                    }}
                    title={`Jump to ${d}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

