export const normalizeEventLineForMatch = (line: string): string => {
  return line
    .trim()
    .replace(/^\s*x\s+/i, '')
    .replace(/^\s*-\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

export const extractEventName = (eventLine: string): string => {
  const cleaned = eventLine
    .trim()
    .replace(/^\s*x\s+/i, '')
    .replace(/^\s*-\s+/, '')
    .trim();

  // Remove common time prefixes
  return cleaned
    .replace(/^\d{1,2}:\d{2}\s*(AM|PM)\s*-\s*/i, '')
    .replace(/^all day\s*-\s*/i, '')
    .trim();
};

export const eventToTag = (eventName: string): string => {
  const slug = eventName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  return slug ? `#${slug}` : '#event';
};

const isDateHeader = (line: string) => /^\d{4}-\d{2}-\d{2}/.test(line.trim());
const isSectionHeader = (line: string) => /^\[(.*?)\]$/.test(line.trim());

export const addEventTaskToContent = (params: {
  content: string;
  dateStr: string;
  eventRawLine: string;
  taskName: string;
}): string => {
  const { content, dateStr, eventRawLine, taskName } = params;

  const lines = content.split('\n');

  // Find ALL date blocks matching dateStr (handles duplicate date headers)
  const dateBlocks: { start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(dateStr)) {
      const start = i;
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (isDateHeader(lines[j])) {
          end = j;
          break;
        }
      }
      dateBlocks.push({ start, end });
      i = end - 1; // Skip to end of this block
    }
  }
  
  if (dateBlocks.length === 0) return content;

  // Search ALL matching date blocks for the event line
  const targetNorm = normalizeEventLineForMatch(eventRawLine);
  let eventLineIndex = -1;
  let blockEnd = lines.length;
  
  for (const block of dateBlocks) {
    for (let i = block.start; i < block.end; i++) {
      const line = lines[i];
      if (
        line === eventRawLine ||
        line.trim() === eventRawLine.trim() ||
        normalizeEventLineForMatch(line) === targetNorm
      ) {
        eventLineIndex = i;
        blockEnd = block.end;
        break;
      }
    }
    if (eventLineIndex !== -1) break;
  }
  
  if (eventLineIndex === -1) return content;
  
  // Use the block that contains the found event
  const dateIndex = dateBlocks.find(b => eventLineIndex >= b.start && eventLineIndex < b.end)?.start ?? dateBlocks[0].start;

  // Insert child task under the event
  const childLine = `  - ${taskName}`;
  lines.splice(eventLineIndex + 1, 0, childLine);
  blockEnd += 1;

  // Find or create [DOING]
  let doingHeaderIndex = -1;
  for (let i = dateIndex; i < blockEnd; i++) {
    if (lines[i].trim() === '[DOING]') {
      doingHeaderIndex = i;
      break;
    }
  }

  const eventName = extractEventName(eventRawLine);
  // User request: do not tag DOING items. The relationship is captured by nesting under the event.
  // (We still keep eventName for potential future UX, but do not write a tag into the file here.)
  void eventName;
  const doingItem = `- ${taskName}`;

  if (doingHeaderIndex !== -1) {
    lines.splice(doingHeaderIndex + 1, 0, doingItem);
    return lines.join('\n');
  }

  // If [DOING] missing, insert it after [EVENTS] section if present; otherwise near top of the date block.
  let insertDoingAt = dateIndex + 1;
  // Skip separator line if present
  if (lines[insertDoingAt] && lines[insertDoingAt].trim().startsWith('==')) insertDoingAt += 1;

  let eventsHeaderIndex = -1;
  for (let i = dateIndex; i < blockEnd; i++) {
    if (lines[i].trim() === '[EVENTS]') {
      eventsHeaderIndex = i;
      break;
    }
  }
  if (eventsHeaderIndex !== -1) {
    // Insert DOING after end of EVENTS section (before next section header or date)
    let eventsEnd = blockEnd;
    for (let i = eventsHeaderIndex + 1; i < blockEnd; i++) {
      if (isSectionHeader(lines[i]) || isDateHeader(lines[i])) {
        eventsEnd = i;
        break;
      }
    }
    insertDoingAt = eventsEnd;
  }

  const doingBlock = ['[DOING]', doingItem, ''];
  lines.splice(insertDoingAt, 0, ...doingBlock);
  return lines.join('\n');
};


