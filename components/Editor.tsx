import React, { useRef, useEffect, useState } from 'react';

interface EditorProps {
  content: string;
  onChange: (newContent: string) => void;
  className?: string;
  scrollToDate?: string;
}

const Editor: React.FC<EditorProps> = ({ content, onChange, className = '', scrollToDate }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandPosition, setCommandPosition] = useState({ top: 0, left: 0 });
  const [filteredEvents, setFilteredEvents] = useState<string[]>([]);
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

    const eventLines = eventSectionMatch[1].split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('=='));
      
    return eventLines;
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

    const val = textarea.value;
    const selStart = textarea.selectionStart;
    setCursorIndex(selStart);

    // Look back for /event
    const textBack = val.substring(selStart - 6, selStart);
    if (textBack === '/event') {
      const events = getCurrentDayEvents(val, selStart);
      if (events.length > 0) {
        setFilteredEvents(events);
        const coords = getCaretCoordinates();
        setCommandPosition(coords);
        setShowCommandMenu(true);
      }
    } else {
      if (showCommandMenu) setShowCommandMenu(false);
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
    const tag = `#${eventText.replace(/[^a-zA-Z0-9\s]/g, '').trim()} `;
    
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

  return (
    <div className={`relative h-full w-full bg-paper ${className}`}>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onKeyUp={handleKeyUp}
        onClick={() => setShowCommandMenu(false)}
        className="w-full h-full p-8 font-mono text-sm md:text-base leading-relaxed resize-none outline-none text-ink bg-transparent selection:bg-yellow-200"
        spellCheck={false}
        placeholder="Start typing your tasks... Type /event to tag an event."
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
          <div className="text-xs font-bold text-gray-400 uppercase mb-2 px-2">Tag Event</div>
          <div className="max-h-60 overflow-y-auto">
            {filteredEvents.map((ev, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 rounded transition-colors truncate font-mono block"
                onClick={() => insertEventTag(ev)}
              >
                {ev}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;