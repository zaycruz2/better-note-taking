import React, { useState, useEffect, useCallback } from 'react';
import { 
  Layout, 
  FileText, 
  Columns, 
  MessageSquare, 
  Save,
  Wand2,
  RefreshCw,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Settings
} from 'lucide-react';
import Editor from './components/Editor';
import Visualizer from './components/Visualizer';
import ChatInterface from './components/ChatInterface';
import SettingsModal from './components/SettingsModal';
import AddEventTaskModal from './components/AddEventTaskModal';
import { INITIAL_TEMPLATE } from './utils/constants';
import { generatePlan, summarizeProgress } from './services/geminiService';
import { initGoogleClient, handleAuthClick, getEventsForDate } from './services/googleCalendar';
import { updateSectionForDate } from './utils/textManager';
import { addEventTaskToContent, extractEventName } from './utils/eventTasks';
import { ViewMode } from './types';

const App: React.FC = () => {
  const [content, setContent] = useState<string>(() => {
    return localStorage.getItem('monofocus_content') || INITIAL_TEMPLATE;
  });
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SPLIT);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [addTaskModal, setAddTaskModal] = useState<{
    isOpen: boolean;
    dateStr: string;
    eventRawLine: string;
  }>({ isOpen: false, dateStr: '', eventRawLine: '' });
  
  // Date Navigation State
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Init Google Client on mount
  useEffect(() => {
    initGoogleClient().catch(e => console.warn("Google Client Init:", e));
  }, []);

  // Auto-save logic
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('monofocus_content', content);
      setLastSaved(new Date());
    }, 1000);
    return () => clearTimeout(timer);
  }, [content]);

  // Handle Date Navigation
  const changeDate = (days: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const handleDatePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setSelectedDate(e.target.value);
    }
  };

  // Helper to extract uncompleted items from a previous date
  const getCarryOverItems = (fullContent: string, currentDateStr: string): string[] => {
    // Split into dates
    const dateRegex = /^(\d{4}-\d{2}-\d{2})/gm;
    const indices: {date: string, index: number}[] = [];
    let match;
    while ((match = dateRegex.exec(fullContent)) !== null) {
        indices.push({ date: match[1], index: match.index });
    }

    // Sort by index
    indices.sort((a, b) => a.index - b.index);

    // Find the date immediately before current
    const currentIndex = indices.findIndex(i => i.date === currentDateStr);
    
    let prevBlockContent = "";
    if (currentIndex > 0) {
        // There is a date strictly before this one in the file
        const prev = indices[currentIndex - 1];
        const curr = indices[currentIndex];
        prevBlockContent = fullContent.substring(prev.index, curr.index);
    } else if (currentIndex === -1 && indices.length > 0) {
        // Current date doesn't exist yet, so the "previous" is the last one in file
        const last = indices[indices.length - 1];
        prevBlockContent = fullContent.substring(last.index);
    } else {
        return [];
    }

    // Extract [DOING] from prevBlock
    const doingMatch = prevBlockContent.match(/\[DOING\]([\s\S]*?)(\[|$)/);
    if (!doingMatch) return [];

    const lines = doingMatch[1].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('=='));
    const incomplete = lines.filter(l => !l.toLowerCase().startsWith('x '));
    
    return incomplete;
  };

  // Add Entry for a date if it doesn't exist
  const handleAddEntry = (dateStr: string) => {
    const carryOver = getCarryOverItems(content, dateStr);
    const doingContent = carryOver.length > 0 ? carryOver.join('\n') : '';

    const newEntry = `\n\n${dateStr}\n========================================\n[EVENTS]\n\n[DOING]\n${doingContent}\n\n[DONE]\n\n[NOTES]\n`;
    
    setContent(prev => {
        if (prev.includes(dateStr)) return prev;
        return prev + newEntry; 
    });
  };

  // Sync Calendar
  const handleSyncCalendar = useCallback(async (dateStr: string) => {
    setIsProcessing(true);
    try {
      await handleAuthClick();
      const events = await getEventsForDate(dateStr);
      if (events.length === 0) {
        alert("No events found for " + dateStr);
        return;
      }
      
      const updatedContent = updateSectionForDate(content, dateStr, 'EVENTS', events);
      setContent(updatedContent);

    } catch (error: any) {
      console.error("Sync Error:", error);
      let errorMessage = "Unknown error occurred";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object') {
        try {
            if (error.result?.error?.message) errorMessage = error.result.error.message;
            else if (error.message) errorMessage = String(error.message);
            else errorMessage = JSON.stringify(error);
        } catch (e) { errorMessage = "Error object could not be stringified"; }
      }
      alert(`Calendar Sync Failed: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  }, [content]);

  // Handle Event Task Addition
  const handleAddEventTask = useCallback((dateStr: string, eventRawLine: string) => {
    setAddTaskModal({ isOpen: true, dateStr, eventRawLine });
  }, []);

  // Handle Toggling items in Visualizer (write back to text)
  const handleToggleItem = useCallback((itemRaw: string) => {
    setContent(prev => {
        const lines = prev.split('\n');
        // We use strict equality for lines to avoid replacing duplicates wrong
        const index = lines.findIndex(l => l === itemRaw);
        
        if (index !== -1) {
            const line = lines[index];
            if (line.trim().toLowerCase().startsWith('x ')) {
                // Uncheck
                // Regex to remove 'x ' case insensitively but preserve leading space
                lines[index] = line.replace(/x /i, '');
            } else {
                // Check
                const spaces = line.match(/^\s*/)?.[0] || '';
                lines[index] = spaces + 'x ' + line.trim();
            }
            return lines.join('\n');
        }
        return prev;
    });
  }, []);

  const handleAiOrganize = useCallback(async () => {
    setIsProcessing(true);
    try {
      const organizedContent = await generatePlan(content);
      setContent(organizedContent);
    } catch (e) {
      alert("Failed to organize content.");
    } finally {
      setIsProcessing(false);
    }
  }, [content]);

  const handleAiSummary = useCallback(async () => {
    setIsProcessing(true);
    try {
      const summary = await summarizeProgress(content);
      setContent(prev => prev + `\n\n[NOTES]\n* AI Summary (${new Date().toLocaleTimeString()}): ${summary}`);
    } catch (e) {
       alert("Failed to generate summary.");
    } finally {
      setIsProcessing(false);
    }
  }, [content]);

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-50 text-gray-800 font-sans overflow-hidden">
      {/* Header Toolbar */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-900 rounded-md flex items-center justify-center text-white font-mono font-bold">M</div>
          
          {/* Date Navigation */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 ml-2 sm:ml-4">
             <button onClick={() => changeDate(-1)} className="p-1.5 hover:bg-white hover:shadow rounded-md text-gray-600 transition-all">
               <ChevronLeft className="w-4 h-4" />
             </button>
             
             <div className="relative group px-3 py-1 text-sm font-semibold font-mono text-gray-700 cursor-pointer flex items-center gap-2">
               <span>{selectedDate}</span>
               <CalendarIcon className="w-3 h-3 text-gray-400 group-hover:text-gray-900" />
               <input 
                 type="date" 
                 value={selectedDate}
                 onChange={handleDatePick}
                 className="absolute inset-0 opacity-0 cursor-pointer"
               />
             </div>

             <button onClick={() => changeDate(1)} className="p-1.5 hover:bg-white hover:shadow rounded-md text-gray-600 transition-all">
               <ChevronRight className="w-4 h-4" />
             </button>
          </div>

          <span className="text-xs text-gray-400 ml-4 hidden md:block">
            {lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : 'Unsaved'}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            <button 
              onClick={() => setViewMode(ViewMode.EDITOR)}
              className={`p-1.5 rounded-md transition-all ${viewMode === ViewMode.EDITOR ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              title="Editor Only"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.SPLIT)}
              className={`p-1.5 rounded-md transition-all ${viewMode === ViewMode.SPLIT ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
               title="Split View"
            >
              <Columns className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.PREVIEW)}
              className={`p-1.5 rounded-md transition-all ${viewMode === ViewMode.PREVIEW ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
               title="Preview Only"
            >
              <Layout className="w-4 h-4" />
            </button>
          </div>

          <div className="hidden md:block h-6 w-px bg-gray-200 mx-1"></div>

          <div className="flex gap-2">
            <button
               onClick={() => setIsSettingsOpen(true)}
               className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600 transition-colors"
               title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>

             <button 
              onClick={handleAiOrganize}
              disabled={isProcessing}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors text-xs sm:text-sm font-medium"
              title="Auto Organize"
            >
              {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              <span className="hidden lg:inline">Auto-Organize</span>
            </button>
             <button 
              onClick={handleAiSummary}
              disabled={isProcessing}
              className="flex items-center gap-2 px-3 py-1.5 text-gray-600 rounded-md hover:bg-gray-100 transition-colors text-xs sm:text-sm font-medium"
              title="Summarize"
            >
              <Save className="w-4 h-4" />
              <span className="hidden lg:inline">Summarize</span>
            </button>
            
            <button 
              onClick={() => setIsChatOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-xs sm:text-sm font-medium"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden lg:inline">Assistant</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex">
        
        {/* Editor Panel */}
        <div className={`
          flex-1 h-full transition-all duration-300
          ${viewMode === ViewMode.PREVIEW ? 'hidden' : 'block'}
          ${viewMode === ViewMode.SPLIT ? 'w-1/2 border-r border-gray-200' : 'w-full'}
        `}>
          <Editor 
            content={content} 
            onChange={setContent} 
            scrollToDate={selectedDate}
            focusedDate={selectedDate}
            onAddEventTask={handleAddEventTask}
          />
        </div>

        {/* Visualizer Panel */}
        <div className={`
          h-full transition-all duration-300 bg-gray-50
          ${viewMode === ViewMode.EDITOR ? 'hidden' : 'block'}
          ${viewMode === ViewMode.SPLIT ? 'w-1/2' : 'w-full'}
        `}>
          <Visualizer 
            content={content} 
            focusedDate={selectedDate}
            onAddEntry={handleAddEntry}
            onSyncCalendar={handleSyncCalendar}
            onAddEventTask={handleAddEventTask}
            onToggleItem={handleToggleItem}
          />
        </div>

      </main>

      {/* Overlays */}
      <ChatInterface 
        fileContent={content} 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
      />
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      <AddEventTaskModal
        isOpen={addTaskModal.isOpen}
        eventLabel={extractEventName(addTaskModal.eventRawLine || '')}
        onClose={() => setAddTaskModal({ isOpen: false, dateStr: '', eventRawLine: '' })}
        onSubmit={(taskName) => {
          setContent((prev) =>
            addEventTaskToContent({
              content: prev,
              dateStr: addTaskModal.dateStr,
              eventRawLine: addTaskModal.eventRawLine,
              taskName
            })
          );
          setAddTaskModal({ isOpen: false, dateStr: '', eventRawLine: '' });
        }}
      />
    </div>
  );
};

export default App;