export const updateSectionForDate = (
  content: string, 
  date: string, 
  sectionName: string, 
  newItems: string[]
): string => {
  const lines = content.split('\n');
  const dateHeader = date;
  const sectionHeader = `[${sectionName}]`;
  
  // Find date index
  let dateIndex = -1;
  // Use a simple startsWith check for the date line to support "YYYY-MM-DD"
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(dateHeader)) {
      dateIndex = i;
      break;
    }
  }

  // If date doesn't exist, create it at the top
  if (dateIndex === -1) {
    const blockLines: string[] = [
      dateHeader,
      '========================================',
      sectionHeader,
      ...newItems,
      '',
      '[DOING]',
      '',
      '[DONE]',
      '',
      '[NOTES]',
      '',
      '',
    ];
    // Create with exactly one blank line separating from existing content (if any).
    const existing = (content || '').replace(/^\n+/, '');
    return blockLines.join('\n') + existing;
  }

  // Search for section within that date
  // We scan from dateIndex until we hit another Date Header or End of File
  let sectionIndex = -1;
  let nextSectionIndex = -1;
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}/;
  const genericHeaderRegex = /^\[(.*?)\]$/;

  for (let i = dateIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (dateRegex.test(line)) {
      // Reached next date
      break;
    }
    
    if (line === sectionHeader) {
      sectionIndex = i;
      // Find end of this section (start of next section or next date)
      for (let j = i + 1; j < lines.length; j++) {
        const subLine = lines[j].trim();
        if (dateRegex.test(subLine) || (genericHeaderRegex.test(subLine))) {
            nextSectionIndex = j;
            break;
        }
      }
      // If no next section found, it goes to end of file/date block
      if (nextSectionIndex === -1) {
          // Check if we hit end of file or next date in the outer loop context?
          // We can just scan until next date or EOF
          for (let k = i + 1; k < lines.length; k++) {
             if (dateRegex.test(lines[k].trim())) {
                 nextSectionIndex = k;
                 break;
             }
          }
          if (nextSectionIndex === -1) nextSectionIndex = lines.length;
      }
      break;
    }
  }

  if (sectionIndex !== -1) {
    // Section exists, replace content
    const before = lines.slice(0, sectionIndex + 1);
    const after = lines.slice(nextSectionIndex);
    return [...before, ...newItems, ...after].join('\n');
  } else {
    // Section does not exist under this date, insert it after the separator line if possible
    // Assuming format: Date \n Separator \n
    // We insert after dateIndex + 1 (Separator)
    // Or just after Date Index if separator missing
    let insertIndex = dateIndex + 1;
    if (lines[insertIndex] && lines[insertIndex].startsWith('==')) {
        insertIndex++;
    }
    
    const before = lines.slice(0, insertIndex);
    const after = lines.slice(insertIndex);
    const newBlock = [`${sectionHeader}`, ...newItems, ''];
    return [...before, ...newBlock, ...after].join('\n');
  }
};

/**
 * Dedupe duplicate date blocks (YYYY-MM-DD) by merging their sections.
 * This repairs cases where the same day header was accidentally inserted twice.
 */
export function dedupeDateBlocks(content: string): string {
  if (!content || typeof content !== 'string') return content;
  const lines = content.split('\n');
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const headerRegex = /^\[(.*?)\]$/;

  type SectionMap = Map<string, string[]>;
  type DayAcc = {
    date: string;
    separator: string;
    sections: SectionMap;
    order: string[]; // section header order encountered
  };

  const days = new Map<string, DayAcc>();
  const dayOrder: string[] = [];

  const isBlank = (s: string) => (s || '').trim() === '';

  let i = 0;
  while (i < lines.length) {
    const maybeDate = (lines[i] || '').trim();
    if (!dateRegex.test(maybeDate)) {
      i++;
      continue;
    }

    const date = maybeDate;
    const startIdx = i;
    i++;

    // Separator line (optional)
    let separator = '========================================';
    if (i < lines.length && (lines[i] || '').trim().startsWith('==')) {
      separator = (lines[i] || '').trim();
      i++;
    }

    // Collect until next date header
    const blockLines: string[] = [];
    while (i < lines.length) {
      const t = (lines[i] || '').trim();
      if (dateRegex.test(t)) break;
      blockLines.push(lines[i] || '');
      i++;
    }

    // Parse sections within block
    const sections: SectionMap = new Map();
    const order: string[] = [];
    let currentHeader: string | null = null;

    const ensureSection = (h: string) => {
      if (!sections.has(h)) sections.set(h, []);
      if (!order.includes(h)) order.push(h);
    };

    for (const raw of blockLines) {
      const t = (raw || '').trim();
      const m = t.match(headerRegex);
      if (m) {
        currentHeader = `[${m[1].toUpperCase()}]`;
        ensureSection(currentHeader);
        continue;
      }
      if (currentHeader) {
        sections.get(currentHeader)!.push(raw);
      }
    }

    // Merge into accumulator
    const existing = days.get(date);
    if (!existing) {
      days.set(date, { date, separator, sections, order });
      dayOrder.push(date);
    } else {
      // Prefer existing separator; just merge sections
      for (const h of order) {
        const incoming = sections.get(h) || [];
        if (!existing.sections.has(h)) {
          existing.sections.set(h, [...incoming]);
          existing.order.push(h);
          continue;
        }
        const cur = existing.sections.get(h)!;
        // Append non-duplicate lines (exact match) preserving order
        for (const line of incoming) {
          // Preserve blank lines only if they add meaning (avoid unbounded growth)
          if (isBlank(line)) {
            if (cur.length === 0 || !isBlank(cur[cur.length - 1])) cur.push(line);
            continue;
          }
          if (!cur.includes(line)) cur.push(line);
        }
      }
    }
  }

  // If no dates found or no duplicates, return original
  if (dayOrder.length === 0) return content;

  // Rebuild content in the original day encounter order
  const rebuilt: string[] = [];
  for (const date of dayOrder) {
    const acc = days.get(date);
    if (!acc) continue;
    rebuilt.push(date);
    rebuilt.push(acc.separator);

    // Canonical section ordering preference
    const preferred = ['[EVENTS]', '[DOING]', '[BACKLOG]', '[DONE]', '[NOTES]'];
    const headers = [
      ...preferred.filter((h) => acc.sections.has(h)),
      ...acc.order.filter((h) => !preferred.includes(h)),
    ];

    const pushSectionBodyCanonical = (body: string[]) => {
      // Idempotent formatting: trim only leading/trailing blank lines of the section body,
      // but preserve internal blank lines.
      let start = 0;
      while (start < body.length && isBlank(body[start] || '')) start++;
      let end = body.length - 1;
      while (end >= start && isBlank(body[end] || '')) end--;
      for (let bi = start; bi <= end; bi++) {
        rebuilt.push(body[bi] || '');
      }
    };

    for (let hi = 0; hi < headers.length; hi++) {
      const h = headers[hi];
      rebuilt.push(h);
      const body = acc.sections.get(h) || [];
      pushSectionBodyCanonical(body);
      // Exactly one blank line between sections (but not double-blank before next date).
      if (hi !== headers.length - 1) rebuilt.push('');
    }
    // Exactly one blank line between days.
    rebuilt.push('');
  }

  return rebuilt.join('\n');
}
