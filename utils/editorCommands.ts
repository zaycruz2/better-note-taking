export type CommandMode = 'event' | 'subtask' | 'done';

export interface DetectedCommand {
  mode: CommandMode;
  /**
   * Start index (inclusive) of the slash command in the full text.
   * Points at the '/' character.
   */
  start: number;
  /**
   * End index (exclusive) of the command *including* any trailing whitespace
   * up to the cursor position.
   */
  end: number;
  value: '/event' | '/subtask' | '/done';
}

/**
 * Detect a slash-command immediately before the cursor.
 *
 * Supports trailing whitespace so users can type "/subtask " and still get the menu.
 */
export function detectCommandAtCursor(text: string, cursor: number): DetectedCommand | null {
  if (typeof text !== 'string') return null;
  if (!Number.isFinite(cursor)) return null;
  if (cursor < 0 || cursor > text.length) return null;

  const before = text.slice(0, cursor);
  // Allow start-of-string or whitespace before the command; allow any whitespace after.
  const match = before.match(/(^|\s)(\/event|\/subtask|\/done)\s*$/);
  if (!match) return null;

  const value = match[2] as DetectedCommand['value'];
  const mode = value.slice(1) as CommandMode;

  // Find the last occurrence of the matched command token; that's the slash index.
  const start = before.lastIndexOf(value);
  if (start < 0) return null;

  return { mode, start, end: cursor, value };
}

export function stripRange(text: string, start: number, end: number): { text: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  return {
    text: text.slice(0, safeStart) + text.slice(safeEnd),
    cursor: safeStart,
  };
}

