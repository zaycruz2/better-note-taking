export const extractTagsFromLine = (line) => {
  const trimmed = (line || '').trim();
  if (!trimmed) return { baseText: '', tags: [] };

  // Remove common task prefixes for parsing
  let working = trimmed.replace(/^\s*x\s+/i, '').replace(/^\s*-\s+/, '').trim();
  if (!working) return { baseText: '', tags: [] };

  const tokens = working.split(/\s+/);

  // Only treat trailing #tags as tags (so inline hashtags in the middle don't get stripped)
  const tags = [];
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    if (last && last.startsWith('#') && last.length > 1) {
      tags.unshift(last);
      tokens.pop();
    } else {
      break;
    }
  }

  return {
    baseText: tokens.join(' ').trim(),
    tags
  };
};

export const tagToLabel = (tag) => {
  const raw = (tag || '').replace(/^#/, '').trim();
  if (!raw) return '';
  return raw.replace(/_/g, ' ');
};

const normalizeForMatch = (line) =>
  (line || '')
    .trim()
    .replace(/^\s*x\s+/i, '')
    .replace(/^\s*-\s+/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const isDateHeader = (line) => /^\d{4}-\d{2}-\d{2}/.test((line || '').trim());
const isSectionHeader = (line) => /^\[(.*?)\]$/.test((line || '').trim());

const findDateBlock = (lines, dateStr) => {
  let dateIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] || '').trim().startsWith(dateStr)) {
      dateIndex = i;
      break;
    }
  }
  if (dateIndex === -1) return null;

  let blockEnd = lines.length;
  for (let i = dateIndex + 1; i < lines.length; i++) {
    if (isDateHeader(lines[i])) {
      blockEnd = i;
      break;
    }
  }

  return { dateIndex, blockEnd };
};

const findSectionWithinBlock = (lines, dateIndex, blockEnd, header) => {
  let headerIndex = -1;
  for (let i = dateIndex; i < blockEnd; i++) {
    if ((lines[i] || '').trim() === header) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return null;

  let endIndex = blockEnd;
  for (let i = headerIndex + 1; i < blockEnd; i++) {
    if (isSectionHeader(lines[i]) || isDateHeader(lines[i])) {
      endIndex = i;
      break;
    }
  }

  return { headerIndex, endIndex };
};

export const getDoingItemsForDate = (content, dateStr) => {
  const lines = (content || '').split('\n');
  const block = findDateBlock(lines, dateStr);
  if (!block) return [];
  const doing = findSectionWithinBlock(lines, block.dateIndex, block.blockEnd, '[DOING]');
  if (!doing) return [];

  const out = [];
  for (let i = doing.headerIndex + 1; i < doing.endIndex; i++) {
    const raw = lines[i];
    const trimmed = (raw || '').trim();
    if (!trimmed || trimmed.startsWith('==')) continue;
    // Only include typical DOING lines
    if (trimmed.startsWith('- ') || trimmed.startsWith('x ')) out.push(raw);
  }
  return out;
};

export const moveDoingItemToDone = (params) => {
  const { content, dateStr, doingRawLine } = params;
  if (!content || !dateStr || !doingRawLine) return content;

  const lines = content.split('\n');
  const block = findDateBlock(lines, dateStr);
  if (!block) return content;

  const doing = findSectionWithinBlock(lines, block.dateIndex, block.blockEnd, '[DOING]');
  if (!doing) return content;

  const targetNorm = normalizeForMatch(doingRawLine);
  let matchIndex = -1;
  for (let i = doing.headerIndex + 1; i < doing.endIndex; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line === doingRawLine || (line.trim() === doingRawLine.trim())) {
      matchIndex = i;
      break;
    }
    if (normalizeForMatch(line) === targetNorm) {
      matchIndex = i;
      break;
    }
  }
  if (matchIndex === -1) return content;

  const removed = lines.splice(matchIndex, 1)[0] || '';

  // Find (or create) DONE
  let blockEnd = block.blockEnd - 1; // blockEnd shifted by -1 after splice
  const doneExisting = findSectionWithinBlock(lines, block.dateIndex, blockEnd + 1, '[DONE]');

  const cleaned = (removed || '')
    .trim()
    .replace(/^\s*x\s+/i, '')
    .replace(/^\s*-\s+/, '')
    .trim();

  // For syncing with event sub-tasks, we match by "baseText" (no trailing #tags).
  const { baseText } = extractTagsFromLine(cleaned);
  const matchText = (baseText || cleaned).trim();

  const doneLine = cleaned ? `x ${cleaned}` : '';
  if (!doneLine) return lines.join('\n');

  // If this task exists as a child under [EVENTS], mark that child as done too (keep it under the event, but completed).
  const events = findSectionWithinBlock(lines, block.dateIndex, blockEnd + 1, '[EVENTS]');
  if (events && matchText) {
    const matchNorm = normalizeForMatch(matchText);
    for (let i = events.headerIndex + 1; i < events.endIndex; i++) {
      const line = lines[i] || '';
      // Only consider indented child lines under events
      if (!(line.startsWith('  ') || line.startsWith('\t'))) continue;

      const indentation = (line.match(/^\s*/)?.[0]) || '';
      const t = line.trim();
      // Normalize child text: strip "- " and "x "
      const childClean = t.replace(/^\s*x\s+/i, '').replace(/^\s*-\s+/, '').trim();
      if (!childClean) continue;
      if (normalizeForMatch(childClean) === matchNorm) {
        // Mark as done while preserving indentation
        lines[i] = `${indentation}x ${childClean}`;
        break;
      }
    }
  }

  if (doneExisting) {
    lines.splice(doneExisting.headerIndex + 1, 0, doneLine);
    return lines.join('\n');
  }

  // Insert [DONE] after DOING section (or near top of date block) if missing
  const doingAfterRemoval = findSectionWithinBlock(lines, block.dateIndex, blockEnd + 1, '[DOING]');
  let insertAt = block.dateIndex + 1;
  if (lines[insertAt] && (lines[insertAt] || '').trim().startsWith('==')) insertAt += 1;
  if (doingAfterRemoval) insertAt = doingAfterRemoval.endIndex;

  lines.splice(insertAt, 0, '[DONE]', doneLine, '');
  return lines.join('\n');
};

export const deleteEventSubtask = (params) => {
  const { content, dateStr, subtaskRawLine } = params;
  if (!content || !dateStr || !subtaskRawLine) return content;

  const lines = content.split('\n');
  const block = findDateBlock(lines, dateStr);
  if (!block) return content;

  // Remove the subtask line under [EVENTS]
  const events = findSectionWithinBlock(lines, block.dateIndex, block.blockEnd, '[EVENTS]');
  if (!events) return content;

  const targetNorm = normalizeForMatch(subtaskRawLine);
  let removedText = '';
  for (let i = events.headerIndex + 1; i < events.endIndex; i++) {
    const line = lines[i] || '';
    // Only consider indented child lines
    if (!(line.startsWith('  ') || line.startsWith('\t'))) continue;
    if (line === subtaskRawLine || line.trim() === subtaskRawLine.trim() || normalizeForMatch(line) === targetNorm) {
      removedText = line.trim().replace(/^\s*x\s+/i, '').replace(/^\s*-\s+/, '').trim();
      lines.splice(i, 1);
      break;
    }
  }

  if (!removedText) return lines.join('\n');

  // Best-effort: also remove the matching DOING line (if present) to avoid duplicates.
  const blockAfter = findDateBlock(lines, dateStr);
  if (!blockAfter) return lines.join('\n');
  const doing = findSectionWithinBlock(lines, blockAfter.dateIndex, blockAfter.blockEnd, '[DOING]');
  if (!doing) return lines.join('\n');

  const matchNorm = normalizeForMatch(removedText);
  for (let i = doing.headerIndex + 1; i < doing.endIndex; i++) {
    const raw = lines[i] || '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('==')) continue;
    const cleaned = trimmed.replace(/^\s*x\s+/i, '').replace(/^\s*-\s+/, '').trim();
    const { baseText } = extractTagsFromLine(cleaned);
    const candidate = (baseText || cleaned).trim();
    if (normalizeForMatch(candidate) === matchNorm) {
      lines.splice(i, 1);
      break;
    }
  }

  return lines.join('\n');
};


