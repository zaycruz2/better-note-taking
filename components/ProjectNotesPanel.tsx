import React, { useEffect, useRef, useState } from 'react';
import type { ProjectRecord } from '../types';
import { insertProjectNoteDate } from '../utils/projectNotes';
import { detectCommandAtCursor } from '../utils/editorCommands';

export default function ProjectNotesPanel(props: {
  project: ProjectRecord | null;
  allProjects: ProjectRecord[];
  enabled: boolean;
  onUpdateNotes: (projectId: string, notes: string) => Promise<void>;
}) {
  const { project, allProjects, enabled, onUpdateNotes } = props;

  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [insertDateDraft, setInsertDateDraft] = useState(() => new Date().toISOString().slice(0, 10));

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandPosition, setCommandPosition] = useState({ top: 0, left: 0 });
  const [commandTrigger, setCommandTrigger] = useState<{ start: number; end: number } | null>(null);
  const [filteredProjects, setFilteredProjects] = useState<ProjectRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setDraft(project?.notes || '');
    setDirty(false);
    setSaveError(null);
    setInsertDateDraft(new Date().toISOString().slice(0, 10));
    setShowCommandMenu(false);
    setCommandTrigger(null);
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


  const getCaretCoordinates = () => {
    const textarea = textareaRef.current;
    if (!textarea) return { top: 0, left: 0 };

    const { selectionStart } = textarea;
    const div = document.createElement('div');
    const style = window.getComputedStyle(textarea);

    const properties = [
      'direction',
      'boxSizing',
      'width',
      'height',
      'overflowX',
      'overflowY',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'borderStyle',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'fontStyle',
      'fontVariant',
      'fontWeight',
      'fontStretch',
      'fontSize',
      'fontSizeAdjust',
      'lineHeight',
      'fontFamily',
      'textAlign',
      'textTransform',
      'textIndent',
      'textDecoration',
      'letterSpacing',
      'wordSpacing',
      'tabSize',
      'MozTabSize',
    ];

    properties.forEach((prop) => {
      // @ts-ignore
      div.style[prop] = style[prop];
    });

    div.style.position = 'absolute';
    div.style.top = '0';
    div.style.left = '-9999px';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';

    div.textContent = textarea.value.substring(0, selectionStart);

    const span = document.createElement('span');
    span.textContent = '.';
    div.appendChild(span);

    document.body.appendChild(div);

    const spanOffsetLeft = span.offsetLeft;
    const spanOffsetTop = span.offsetTop;

    document.body.removeChild(div);

    const top = spanOffsetTop - textarea.scrollTop;
    const left = spanOffsetLeft - textarea.scrollLeft;
    const lineHeight = parseInt(style.lineHeight) || 24;

    return { top: top + lineHeight, left };
  };

  const insertProjectReference = (p: ProjectRecord) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (!commandTrigger) return;

    const textBefore = draft.substring(0, commandTrigger.start);
    const textAfter = draft.substring(commandTrigger.end);
    const tag = `[[project:${p.id}|${p.name}]] `;
    const next = textBefore + tag + textAfter;

    setDraft(next);
    setDirty(true);
    setShowCommandMenu(false);
    setCommandTrigger(null);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = textBefore.length + tag.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (
      showCommandMenu &&
      (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')
    ) {
      return;
    }

    const val = textarea.value;
    const cursor = textarea.selectionStart;

    const detected = detectCommandAtCursor(val, cursor);
    if (detected && detected.mode === 'project') {
      const cmdText = val.slice(detected.start, detected.end);
      const query = cmdText.replace(/^\/(project|proj)\s*/i, '').trim().toLowerCase();
      const list = (allProjects || [])
        .filter((p) => !!p?.name)
        .filter((p) => (project?.id ? p.id !== project.id : true))
        .filter((p) => (query ? p.name.toLowerCase().includes(query) : true))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (list.length > 0) {
        setFilteredProjects(list);
        setSelectedIndex(0);
        setCommandTrigger({ start: detected.start, end: detected.end });
        setCommandPosition(getCaretCoordinates());
        setShowCommandMenu(true);
        return;
      }
    }

    if (showCommandMenu) {
      setShowCommandMenu(false);
      setCommandTrigger(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showCommandMenu) return;
    if (!filteredProjects || filteredProjects.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredProjects.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredProjects.length) % filteredProjects.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const p = filteredProjects[selectedIndex];
      if (!p) return;
      insertProjectReference(p);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowCommandMenu(false);
      setCommandTrigger(null);
      return;
    }
  };

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

        <div className="flex-1 min-h-0">
          <div className="relative h-full w-full">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(true);
              }}
              onKeyUp={handleKeyUp}
              onKeyDown={handleKeyDown}
              onClick={() => {
                setShowCommandMenu(false);
                setCommandTrigger(null);
              }}
              readOnly={!enabled}
              className="w-full h-full p-6 font-mono text-sm md:text-base leading-relaxed resize-none outline-none text-ink bg-transparent selection:bg-yellow-200"
              spellCheck={false}
              placeholder={`Tip: type /project to insert a project reference.\n\n2025-12-19\n========================================\nDid X\n\n2025-12-20\n========================================\nDid Y`}
            />

            {showCommandMenu && (
              <div
                className="absolute bg-white border border-gray-200 shadow-xl rounded-lg p-2 w-80 z-20 animate-in fade-in zoom-in-95 duration-75"
                style={{
                  top: `${commandPosition.top}px`,
                  left: `${commandPosition.left}px`,
                  transform: `translateY(${commandPosition.top > (textareaRef.current?.clientHeight || 0) - 200 ? '-100%' : '0'})`,
                }}
              >
                <div className="text-xs font-bold text-gray-400 uppercase mb-2 px-2">Insert Project Reference</div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredProjects.map((p, i) => (
                    <button
                      key={p.id}
                      className={`w-full text-left px-3 py-2 text-sm rounded transition-colors truncate font-mono block ${
                        i === selectedIndex ? 'bg-purple-50 text-purple-700' : 'hover:bg-purple-50 hover:text-purple-700'
                      }`}
                      onClick={() => insertProjectReference(p)}
                      title={p.name}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

