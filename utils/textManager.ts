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
    const newSectionBlock = `\n${dateHeader}\n========================================\n${sectionHeader}\n${newItems.join('\n')}\n\n[DOING]\n\n[BACKLOG]\n\n[DONE]\n\n[NOTES]\n`;
    return newSectionBlock + content;
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
