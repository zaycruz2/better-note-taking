import React, { useRef, useEffect, useState } from 'react';
import { extractEventName, eventToTag } from '../utils/eventTasks';
import { getDoingItemsForDate, moveDoingItemToDone, extractTagsFromLine, tagToLabel } from '../utils/doingDone.js';

interface EditorProps {
  content: string;
  onChange: (newContent: string) => void;
  className?: string;
  scrollToDate?: string;
  focusedDate: string;
  onAddEventTask?: (dateStr: string, eventRawLine: string) => void;
}

const Editor: React.FC<EditorProps> = ({ content, onChange, className = '', scrollToDate, focusedDate, onAddEventTask }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandPosition, setCommandPosition] = useState({ top: 0, left: 0 });
  const [filteredEvents, setFilteredEvents] = useState<string[]>([]);
  const [filteredDoing, setFilteredDoing] = useState<string[]>([]);
  const [commandMode, setCommandMode] = useState<'event' | 'done' | 'subtask'>('event');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorIndex, setCursorIndex] = useState(0);

  useEffect(() => {
    if (scrollToDate && textareaRef.current && content) {
      const index = content.indexOf(scrollToDate);
      
      if (index !== -1) {
        const textarea = textareaRef.current;
        textarea.blur(); 
        textarea.focus();
        textarea.setSelectionRange(index, index);
        
        const textBefore = content.substring(0, index);
        const lines = textBefore.split('\n').length;
        const lineHeight = 24; 
        textarea.scrollTop = (lines - 1) * lineHeight;
      }
    }
  }, [scrollToDate]); 

  const getCurrentDayEvents = (fullContent: string, cursorPosition: number) => {
    const textBefore = fullContent.substring(0, cursorPosition);
    const dateHeaders = [...textBefore.matchAll(/^(\d{4}-\d{2}-\d{2})/gm)];
    const lastDate = dateHeaders.pop();
    
    if (!lastDate) return [];

    const dateIndex = lastDate.index || 0;
    const remainingText = fullContent.substring(dateIndex);
    const nextDateMatch = remainingText.slice(1).match(/^(\d{4}-\d{2}-\d{2})/m);
    const blockEnd = nextDateMatch ? nextDateMatch.index! + 1 : remainingText.length;
    const dayBlock = remainingText.substring(0, blockEnd);

    const eventSectionMatch = dayBlock.match(/\[EVENTS\]([\s\S]*?)(\[|$)/);
    if (!eventSectionMatch) return [];

    // Only include top-level event lines. Exclude:
    // - indented child tasks (e.g. "  - Draft agenda")
    // - task-like lines (e.g. "- Draft agenda", "x Draft agenda")
    const eventLines = eventSectionMatch[1]
      .split('\n')
      .filter((l) => {
        if (!l) return false;
        if (l.startsWith('  ') || l.startsWith('\t')) return false; // child task
        const t = l.trim();
        if (!t || t.startsWith('==')) return false;
        if (t.startsWith('- ')) return false;
        if (/^x\s+/i.test(t)) return false;
        return true;
      })
      .map((l) => l.trim());
      
    return eventLines;
  };

  const getCurrentDayDate = (fullContent: string, cursorPosition: number): string | null => {
    const textBefore = fullContent.substring(0, cursorPosition);
    const dateHeaders = [...textBefore.matchAll(/^(\d{4}-\d{2}-\d{2})/gm)];
    const lastDate = dateHeaders.pop();
    return lastDate?.[1] || null;
  };

  const getCaretCoordinates = () => {
    const textarea = textareaRef.current;
    if (!textarea) return { top: 0, left: 0 };

    const { selectionStart } = textarea;
    const div = document.createElement('div');
    const style = window.getComputedStyle(textarea);
    
    // Copy relevant styles to mirror div
    const properties = [
      'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
      'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing',
      'tabSize', 'MozTabSize'
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
    div.style.wordWrap = 'break-word';  // Important for textarea wrapping

    div.textContent = textarea.value.substring(0, selectionStart);

    const span = document.createElement('span');
    span.textContent = '.'; // Character to measure position
    div.appendChild(span);

    document.body.appendChild(div);
    
    const spanOffsetLeft = span.offsetLeft;
    const spanOffsetTop = span.offsetTop;
    
    document.body.removeChild(div);

    // Calculate relative to textarea wrapper
    // We assume the textarea is inside a relative container. 
    // scrollTop represents how much the textarea is scrolled.
    const top = spanOffsetTop - textarea.scrollTop; 
    const left = spanOffsetLeft - textarea.scrollLeft;
    
    const lineHeight = parseInt(style.lineHeight) || 24;
    
    return { top: top + lineHeight, left: left };
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // When the command menu is open, navigation/selection keys are handled in onKeyDown.
    // If we process them here, we can accidentally re-open/reset the menu (e.g. because "/done" is still present).
    if (
      showCommandMenu &&
      (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape')
    ) {
      return;
    }

    const val = textarea.value;
    const selStart = textarea.selectionStart;
    setCursorIndex(selStart);

    // Look back for /event
    const textBack = val.substring(selStart - 6, selStart);
    if (textBack === '/event') {
      const events = getCurrentDayEvents(val, selStart);
      if (events.length > 0) {
        setFilteredEvents(events);
        setCommandMode('event');
        setSelectedIndex(0);
        const coords = getCaretCoordinates();
        setCommandPosition(coords);
        setShowCommandMenu(true);
      }
      return;
    } else if (val.substring(selStart - 8, selStart) === '/subtask') {
      const events = getCurrentDayEvents(val, selStart);
      if (events.length > 0) {
        setFilteredEvents(events);
        setCommandMode('subtask');
        setSelectedIndex(0);
        const coords = getCaretCoordinates();
        setCommandPosition(coords);
        setShowCommandMenu(true);
      }
      return;
    } else {
      // Look back for /done
      const doneBack = val.substring(selStart - 5, selStart);
      if (doneBack === '/done') {
        // Build the menu from content *without* the /done token so the selected line matches
        // what will exist after we strip the command from the editor.
        const valWithoutCommand = val.substring(0, selStart - 5) + val.substring(selStart);
        const doing = getDoingItemsForDate(valWithoutCommand, focusedDate).filter(Boolean);
        if (doing.length > 0) {
          setFilteredDoing(doing);
          setCommandMode('done');
          setSelectedIndex(0);
          const coords = getCaretCoordinates();
          setCommandPosition(coords);
          setShowCommandMenu(true);
          return;
        }
      }

      if (showCommandMenu) setShowCommandMenu(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showCommandMenu) return;

    const items = commandMode === 'event' || commandMode === 'subtask' ? filteredEvents : filteredDoing;
    if (!items || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % items.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const selected = items[selectedIndex];
      if (!selected) return;
      if (commandMode === 'event') insertEventTag(selected);
      else if (commandMode === 'subtask') createEventSubtask(selected);
      else markDoingAsDone(selected);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowCommandMenu(false);
      return;
    }
  };

  const insertEventTag = (eventText: string) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const val = content;
    const start = cursorIndex;
    
    // Remove the "/event" trigger
    const textBefore = val.substring(0, start - 6);
    const textAfter = val.substring(start);
    
    // Create Tag
    const tag = `${eventToTag(extractEventName(eventText))} `;
    
    const newContent = textBefore + tag + textAfter;
    onChange(newContent);
    setShowCommandMenu(false);
    
    // Restore focus
    requestAnimationFrame(() => {
        textarea.focus();
        const newCursorPos = textBefore.length + tag.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  };

  const createEventSubtask = (eventLine: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const val = content;
    const start = cursorIndex;

    // Remove the "/subtask" trigger
    const textBefore = val.substring(0, start - 8);
    const textAfter = val.substring(start);
    const withoutTrigger = textBefore + textAfter;

    onChange(withoutTrigger);
    setShowCommandMenu(false);

    // Open the existing modal flow (owned by App) for the chosen event
    if (onAddEventTask) onAddEventTask(focusedDate, eventLine);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(textBefore.length, textBefore.length);
    });
  };

  const markDoingAsDone = (doingRawLine: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const val = content;
    const start = cursorIndex;

    // Remove the "/done" trigger
    const textBefore = val.substring(0, start - 5);
    const textAfter = val.substring(start);
    const withoutTrigger = textBefore + textAfter;

    // If the selected item somehow still contains "/done" (e.g. older menu state),
    // strip it so we can match the line inside `withoutTrigger`.
    const cleanedSelected = doingRawLine.replace(/\s\/done\s*$/i, '');

    const newContent = moveDoingItemToDone({
      content: withoutTrigger,
      dateStr: focusedDate,
      doingRawLine: cleanedSelected
    });

    onChange(newContent);
    setShowCommandMenu(false);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(textBefore.length, textBefore.length);
    });
  };

  return (
    <div className={`relative h-full w-full bg-paper ${className}`}>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={() => setShowCommandMenu(false)}
        className="w-full h-full p-8 font-mono text-sm md:text-base leading-relaxed resize-none outline-none text-ink bg-transparent selection:bg-yellow-200"
        spellCheck={false}
        placeholder="Start typing your tasks... Type /event to tag an event, /subtask to add a task under an event, or /done to move a task into DONE."
      />

      {/* CLI Popover */}
      {showCommandMenu && (
        <div 
          className="absolute bg-white border border-gray-200 shadow-xl rounded-lg p-2 w-80 z-20 animate-in fade-in zoom-in-95 duration-75"
          style={{ 
            top: `${commandPosition.top}px`,
            left: `${commandPosition.left}px`,
            // Max bounds check to keep it on screen
            transform: `translateY(${commandPosition.top > (textareaRef.current?.clientHeight || 0) - 200 ? '-100%' : '0'})` 
          }}
        >
          <div className="text-xs font-bold text-gray-400 uppercase mb-2 px-2">
            {commandMode === 'event' ? 'Tag Event' : commandMode === 'subtask' ? 'Add subtask to event' : 'Mark Done'}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {(commandMode === 'event' || commandMode === 'subtask') && filteredEvents.map((ev, i) => (
              <button
                key={i}
                className={`w-full text-left px-3 py-2 text-sm rounded transition-colors truncate font-mono block ${
                  i === selectedIndex ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-indigo-50 hover:text-indigo-700'
                }`}
                onClick={() => (commandMode === 'event' ? insertEventTag(ev) : createEventSubtask(ev))}
              >
                {ev}
              </button>
            ))}

            {commandMode === 'done' && filteredDoing.map((raw, i) => {
              const { baseText, tags } = extractTagsFromLine(raw);
              const label = baseText || raw.trim();
              const tagLabel = tags.length > 0 ? tagToLabel(tags[tags.length - 1]) : '';
              return (
                <button
                  key={i}
                  className={`w-full text-left px-3 py-2 text-sm rounded transition-colors font-mono block ${
                    i === selectedIndex ? 'bg-green-50 text-green-700' : 'hover:bg-green-50 hover:text-green-700'
                  }`}
                  onClick={() => markDoingAsDone(raw)}
                  title={raw.trim()}
                >
                  <div className="truncate">{label}</div>
                  {tagLabel && <div className="text-[11px] text-gray-400 truncate">From: {tagLabel}</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;