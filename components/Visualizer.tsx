import React, { useMemo } from 'react';
import { SectionType, ParsedSection, ParsedDay, ParsedItem } from '../types';
import { Calendar, Plus, RefreshCw, Check, CheckSquare, Square, PlusCircle } from 'lucide-react';

interface VisualizerProps {
  content: string;
  focusedDate: string;
  onAddEntry?: (date: string) => void;
  onSyncCalendar?: (date: string) => void;
  onAddEventTask?: (date: string, eventRawText: string) => void;
  onToggleItem?: (itemRaw: string) => void;
}

const Visualizer: React.FC<VisualizerProps> = ({ 
  content, 
  focusedDate, 
  onAddEntry, 
  onSyncCalendar,
  onAddEventTask,
  onToggleItem
}) => {
  const parsedData = useMemo(() => {
    const lines = content.split('\n');
    const days: Record<string, ParsedDay> = {};
    
    let currentDay: string | null = null;
    let currentSections: ParsedSection[] = [];
    let currentSection: ParsedSection | null = null;
    let dayStartIndex = 0;

    // Regex to identify date headers: YYYY-MM-DD
    const dateRegex = /^(\d{4}-\d{2}-\d{2})/;
    const headerRegex = /^\[(.*?)\]$/;

    lines.forEach((line, index) => {
      // Preserve original line for referencing
      const originalLine = line; 
      const trimmed = line.trim();
      const dateMatch = trimmed.match(dateRegex);
      const headerMatch = trimmed.match(headerRegex);

      // Check if line is a Date Header
      if (dateMatch) {
        // Save previous day
        if (currentDay) {
           if (currentSection) currentSections.push(currentSection);
           days[currentDay] = { date: currentDay, sections: currentSections, startIndex: dayStartIndex };
        }

        // Start new day
        currentDay = dateMatch[1];
        currentSections = [];
        currentSection = null;
        dayStartIndex = index;
        return;
      }

      // If we are inside a day, parse sections
      if (currentDay) {
        if (headerMatch) {
          if (currentSection) {
            currentSections.push(currentSection);
          }
          const title = headerMatch[1].toUpperCase();
          let type = SectionType.UNKNOWN;
          if (title.includes('EVENT')) type = SectionType.EVENTS;
          else if (title.includes('DOING')) type = SectionType.DOING;
          else if (title.includes('DONE')) type = SectionType.DONE;
          else if (title.includes('NOTE')) type = SectionType.NOTES;

          currentSection = {
            type,
            title,
            items: []
          };
        } else if (currentSection && trimmed) {
          if (!trimmed.startsWith('==')) {
            const isCompleted = trimmed.toLowerCase().startsWith('x ');
            const cleanText = isCompleted ? trimmed.substring(2) : trimmed;
            
            // Handle indentation for Events (Child tasks)
            if (currentSection.type === SectionType.EVENTS && (line.startsWith('  ') || line.startsWith('\t'))) {
               // This is a child of the last item
               const lastItem = currentSection.items[currentSection.items.length - 1];
               if (lastItem) {
                 lastItem.children.push({
                   text: cleanText,
                   raw: originalLine,
                   children: [],
                   isCompleted
                 });
               }
            } else {
              // Top level item
              currentSection.items.push({
                text: cleanText,
                raw: originalLine,
                children: [],
                isCompleted
              });
            }
          }
        }
      } 
    });

    // Push last day
    if (currentDay) {
       if (currentSection) currentSections.push(currentSection);
       days[currentDay] = { date: currentDay, sections: currentSections, startIndex: dayStartIndex };
    }

    return days;
  }, [content]);

  const activeDayData = parsedData[focusedDate];

  const renderSectionColor = (type: SectionType) => {
    switch (type) {
      case SectionType.EVENTS: return 'border-l-4 border-blue-400 bg-blue-50/50';
      case SectionType.DOING: return 'border-l-4 border-orange-400 bg-orange-50/50';
      case SectionType.DONE: return 'border-l-4 border-green-400 bg-green-50/50 opacity-75';
      default: return 'border-l-4 border-gray-200 bg-white';
    }
  };

  if (!activeDayData) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center text-gray-400 p-8 space-y-4">
        <Calendar className="w-12 h-12 opacity-20" />
        <p>No entries found for {focusedDate}</p>
        {onAddEntry && (
          <button 
            onClick={() => onAddEntry(focusedDate)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Initialize {focusedDate}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto p-8 space-y-6 bg-white font-sans">
      <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-100 pb-4 mb-6 flex justify-between items-center">
        {new Date(focusedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </h2>
      
      {activeDayData.sections.length === 0 && (
         <p className="text-gray-400 italic">No sections parsed. Check your formatting.</p>
      )}

      {activeDayData.sections.map((section, idx) => (
        <div key={idx} className={`p-4 rounded-r-lg shadow-sm ${renderSectionColor(section.type)} group relative`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-gray-700 tracking-wide text-xs uppercase opacity-70">
              {section.title}
            </h3>
            {section.type === SectionType.EVENTS && onSyncCalendar && (
               <button 
                onClick={() => onSyncCalendar(focusedDate)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white rounded text-blue-500"
                title="Sync from Google Calendar"
               >
                 <RefreshCw className="w-3 h-3" />
               </button>
            )}
          </div>
          
          <ul className="space-y-3">
            {section.items.map((item, i) => (
              <li key={i} className="flex flex-col gap-1">
                {/* Main Item Row */}
                <div className="flex items-start justify-between group/item min-h-[24px] relative">
                  <div className={`text-sm flex-1 ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {item.text}
                  </div>
                  
                  {/* Action Buttons for Events */}
                  {section.type === SectionType.EVENTS && onAddEventTask && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onAddEventTask(focusedDate, item.raw);
                      }}
                      className="opacity-0 group-hover/item:opacity-100 transition-opacity text-gray-400 hover:text-blue-600 p-1 z-10 cursor-pointer"
                      title="Add Todo to Event"
                    >
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Nested Children (Todo list for events) */}
                {item.children.length > 0 && (
                  <ul className="ml-4 pl-4 border-l-2 border-gray-200 space-y-1 mt-1">
                    {item.children.map((child, cIdx) => (
                      <li 
                        key={cIdx} 
                        className="text-xs text-gray-600 flex items-center gap-2 cursor-pointer hover:text-gray-900"
                        onClick={(e) => {
                            e.stopPropagation();
                            if(onToggleItem) onToggleItem(child.raw);
                        }}
                      >
                         {child.isCompleted ? (
                           <CheckSquare className="w-3 h-3 text-green-500 shrink-0" />
                         ) : (
                           <Square className="w-3 h-3 text-gray-400 shrink-0" />
                         )}
                         <span className={child.isCompleted ? 'line-through opacity-50' : ''}>
                           {child.text.replace(/^- /, '')}
                         </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            
            {section.items.length === 0 && (
                <li className="text-xs text-gray-400 italic">Empty</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default Visualizer;