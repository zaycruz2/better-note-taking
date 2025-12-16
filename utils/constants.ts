// Helper to get today's date in YYYY-MM-DD format
const getTodayString = () => new Date().toISOString().split('T')[0];

export const INITIAL_TEMPLATE = `${getTodayString()}
========================================
[EVENTS]

[DOING]

[DONE]

[NOTES]
`;

/**
 * Checks if content is effectively empty (just a template with no real data).
 * A template is considered empty if:
 * - It has at most one date header
 * - All sections ([EVENTS], [DOING], [DONE], [NOTES]) are empty
 */
export function isEmptyTemplate(content: string): boolean {
  if (!content || typeof content !== 'string') return true;
  
  const trimmed = content.trim();
  if (!trimmed) return true;
  
  // Count date headers (YYYY-MM-DD at start of line)
  const dateMatches = trimmed.match(/^\d{4}-\d{2}-\d{2}/gm) || [];
  if (dateMatches.length > 1) return false; // Multiple dates = real content
  
  // Check if sections have any content
  const sectionPattern = /\[(EVENTS|DOING|DONE|NOTES)\]([\s\S]*?)(?=\[|$)/gi;
  let sawSection = false;
  let match;
  while ((match = sectionPattern.exec(trimmed)) !== null) {
    sawSection = true;
    const sectionContent = match[2];
    // Remove separator lines and whitespace
    const cleaned = sectionContent
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('=='))
      .join('');
    if (cleaned.length > 0) return false; // Has real content
  }
  // If we didn't even find the expected section headers, this isn't our empty template.
  if (!sawSection) return false;

  return true;
}

/**
 * Extracts all date headers from content and returns them sorted (newest first).
 */
export function extractDatesFromContent(content: string): string[] {
  if (!content || typeof content !== 'string') return [];
  
  const dateMatches = content.match(/^\d{4}-\d{2}-\d{2}/gm) || [];
  // Remove duplicates and sort descending (newest first)
  const unique = [...new Set(dateMatches)];
  unique.sort((a, b) => b.localeCompare(a));
  return unique;
}

/**
 * Checks if content contains a specific date header.
 */
export function contentHasDate(content: string, dateStr: string): boolean {
  if (!content || !dateStr) return false;
  // Match date at the start of a line
  const regex = new RegExp(`^${dateStr}`, 'm');
  return regex.test(content);
}

export const GEMINI_SYSTEM_INSTRUCTION = `You are an expert productivity assistant integrated into a minimalist text-file based task manager. 
The user manages their life in a single text file with sections organized by Date headers (YYYY-MM-DD).
Within each date, there are sections like [EVENTS], [DOING], [DONE].
Your goal is to help them organize, prioritize, and query this text file.
Always be concise. Match the user's existing formatting style.
When asked to modify the file, return the FULL updated file content unless specified otherwise.
`;