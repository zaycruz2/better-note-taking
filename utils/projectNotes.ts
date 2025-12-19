import { extractDatesFromContent } from './constants.ts';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function findExistingDateIndex(text: string, dateStr: string): number {
  if (!dateStr) return -1;
  const re = new RegExp(`^${dateStr}$`, 'm');
  const m = re.exec(text);
  return m?.index ?? -1;
}

export function getProjectNoteDatesChronological(notes: string): string[] {
  // Existing helper returns newest-first; we want chronological (oldest-first).
  return extractDatesFromContent(notes).slice().reverse();
}

export function insertProjectNoteDate(params: {
  notes: string;
  dateStr: string;
  cursor?: number;
}): { notes: string; cursor: number; inserted: boolean } {
  const { notes, dateStr } = params;
  const existingIdx = findExistingDateIndex(notes || '', dateStr);
  if (existingIdx !== -1) {
    return { notes, cursor: existingIdx, inserted: false };
  }

  const text = notes || '';
  const at = clamp(typeof params.cursor === 'number' ? params.cursor : 0, 0, text.length);

  const before = text.slice(0, at);
  const after = text.slice(at);

  // Insert block with clean spacing:
  // - ensure there is a blank line separating from previous content (if any)
  // - remove leading blank lines from the "after" content to avoid double gaps
  const beforeHasContent = before.trim().length > 0;
  const beforeEndsWithNewline = before.endsWith('\n');
  const beforeEndsWithBlankLine = before.endsWith('\n\n');

  let prefix = '';
  if (beforeHasContent) {
    if (beforeEndsWithBlankLine) prefix = '';
    else if (beforeEndsWithNewline) prefix = '\n';
    else prefix = '\n\n';
  }

  const afterTrimmed = after.replace(/^\n+/, '');

  const header = `${dateStr}\n========================================\n`;
  const insert = `${prefix}${header}\n`;

  const nextText = before + insert + afterTrimmed;

  // Place cursor on the blank line after the separator.
  const cursor = before.length + insert.length;
  return { notes: nextText, cursor, inserted: true };
}

