import React, { useState, useEffect, useCallback } from 'react';
import { 
  Layout, 
  FileText, 
  Columns, 
  MessageSquare, 
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Settings,
  AlertTriangle
} from 'lucide-react';
import Editor from './components/Editor';
import Visualizer from './components/Visualizer';
import ChatInterface from './components/ChatInterface';
import SettingsModal from './components/SettingsModal';
import AddEventTaskModal from './components/AddEventTaskModal';
import { INITIAL_TEMPLATE, extractDatesFromContent, contentHasDate } from './utils/constants';
import { updateSectionForDate } from './utils/textManager';
import { addEventTaskToContent, extractEventName } from './utils/eventTasks';
import { deleteEventSubtask, deleteEvent } from './utils/doingDone.js';
import { handleOAuthCallback, fetchEvents, isConnected, OAuthProvider, refreshOAuthStatus } from './services/oauth';
import {
  getSupabase,
  isSupabaseConfigured,
  getSession,
  signInAnonymously,
  isAnonymousUser,
  fetchNote,
  upsertNote,
  resolveInitialContent,
} from './services/supabaseClient';
import type { Session, User } from '@supabase/supabase-js';
import { ViewMode } from './types';

const CONTENT_STORAGE_KEY = 'monofocus_content';
const CONTENT_UPDATED_AT_KEY = 'monofocus_content_updated_at';
const SELECTED_DATE_KEY = 'monofocus_selected_date';

/**
 * Determines the best initial date to display:
 * 1. Last selected date from localStorage (if valid)
 * 2. Latest date found in content
 * 3. Today's date
 */
function getInitialSelectedDate(content: string): string {
  const today = new Date().toISOString().split('T')[0];
  
  // Try last selected date from localStorage
  try {
    const savedDate = localStorage.getItem(SELECTED_DATE_KEY);
    if (savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
      return savedDate;
    }
  } catch { /* ignore */ }
  
  // Find the latest date in the content
  const dates = extractDatesFromContent(content);
  if (dates.length > 0) {
    return dates[0]; // Already sorted newest first
  }
  
  return today;
}

function getLocalContentRecord() {
  let content = '';
  let updatedAt = 0;
  try {
    content = localStorage.getItem(CONTENT_STORAGE_KEY) || '';
  } catch { content = ''; }
  try {
    updatedAt = Number.parseInt(localStorage.getItem(CONTENT_UPDATED_AT_KEY) || '0', 10) || 0;
  } catch { updatedAt = 0; }
  return { content, updatedAt };
}

function setLocalContentRecord(content: string, updatedAtMs: number) {
  localStorage.setItem(CONTENT_STORAGE_KEY, content);
  localStorage.setItem(CONTENT_UPDATED_AT_KEY, String(updatedAtMs));
}

const App: React.FC = () => {
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sync state
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [isHydratingFromCloud, setIsHydratingFromCloud] = useState(false);

  const [content, setContent] = useState<string>(() => {
    return localStorage.getItem(CONTENT_STORAGE_KEY) || INITIAL_TEMPLATE;
  });
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.SPLIT);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [addTaskModal, setAddTaskModal] = useState<{
    isOpen: boolean;
    dateStr: string;
    eventRawLine: string;
  }>({ isOpen: false, dateStr: '', eventRawLine: '' });
  const [oauthMessage, setOauthMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Date Navigation State - initialized from localStorage or latest date in content
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const initialContent = localStorage.getItem(CONTENT_STORAGE_KEY) || INITIAL_TEMPLATE;
    return getInitialSelectedDate(initialContent);
  });

  // Handle calendar OAuth callback on mount
  useEffect(() => {
    const result = handleOAuthCallback();
    if (result) {
      if (result.success) {
        const providerName = result.provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook';
        setOauthMessage({ type: 'success', text: `Successfully connected to ${providerName}!` });
      } else {
        setOauthMessage({ type: 'error', text: result.error || 'Connection failed' });
      }
      setTimeout(() => setOauthMessage(null), 5000);
    }
  }, []);

  // Initialize Supabase auth
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;

    const initAuth = async () => {
      try {
        // Check for existing session
        const existingSession = await getSession();
        if (existingSession) {
          if (mounted) setSession(existingSession);
        } else {
          // Auto sign-in anonymously for new users
          const { user, error } = await signInAnonymously();
          if (error) {
            console.error('Anonymous sign-in failed:', error);
            if (mounted) setAuthError(error.message);
          } else {
            // Session will be set by the auth listener
          }
        }
      } catch (e: any) {
        console.error('Auth init error:', e);
        if (mounted) setAuthError(e?.message || String(e));
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    // Listen for auth state changes
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((_event, newSession) => {
      if (mounted) setSession(newSession);
    });

    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Refresh calendar connection status when session changes
  useEffect(() => {
    if (!session?.access_token) return;
    refreshOAuthStatus().catch(() => null);
  }, [session?.access_token]);

  // Cloud hydration when session is available
  useEffect(() => {
    if (!session?.user?.id) return;
    if (!isSupabaseConfigured()) return;

    let cancelled = false;

    (async () => {
      setIsHydratingFromCloud(true);
      setCloudError(null);
      try {
        const local = getLocalContentRecord();
        const remote = await fetchNote(session.user.id);

        const remoteUpdatedAt = remote?.updated_at ? new Date(remote.updated_at).getTime() : 0;

        const chosen = resolveInitialContent({
          localContent: local.content,
          localUpdatedAt: local.updatedAt,
          remoteContent: remote?.content ?? '',
          remoteUpdatedAt,
        });

        if (cancelled) return;

        if (chosen.source === 'remote' && chosen.content) {
          setLocalContentRecord(chosen.content, chosen.updatedAt || Date.now());
          setContent(chosen.content);
          setLastCloudSyncAt(chosen.updatedAt || null);
          // Update selected date to the best date from the hydrated content
          const bestDate = getInitialSelectedDate(chosen.content);
          setSelectedDate(bestDate);
        } else if (chosen.source === 'local' && local.content) {
          // Seed the cloud if it doesn't have anything yet
          if (!remote) {
            const saved = await upsertNote(session.user.id, local.content);
            if (!cancelled) setLastCloudSyncAt(new Date(saved.updated_at).getTime());
          }
        }
      } catch (e: any) {
        if (!cancelled) setCloudError(e?.message || String(e));
      } finally {
        if (!cancelled) setIsHydratingFromCloud(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // Auto-save to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      const now = Date.now();
      setLocalContentRecord(content, now);
      setLastSaved(new Date());
    }, 1000);
    return () => clearTimeout(timer);
  }, [content]);

  // Cloud auto-sync (debounced)
  useEffect(() => {
    if (isHydratingFromCloud) return;
    if (!session?.user?.id) return;
    if (!isSupabaseConfigured()) return;

    const timer = setTimeout(async () => {
      try {
        setCloudError(null);
        const saved = await upsertNote(session.user.id, content);
        setLastCloudSyncAt(new Date(saved.updated_at).getTime());
      } catch (e: any) {
        setCloudError(e?.message || String(e));
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [content, session?.user?.id, isHydratingFromCloud]);

  // Persist selected date to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SELECTED_DATE_KEY, selectedDate);
    } catch { /* ignore */ }
  }, [selectedDate]);

  // Auto-insert missing day entry when navigating to a date that doesn't exist
  useEffect(() => {
    // Skip during initial hydration to avoid race conditions
    if (isHydratingFromCloud) return;
    
    // Check if the selected date exists in content
    if (!contentHasDate(content, selectedDate)) {
      // Extract carry-over items from the previous day inline
      const getCarryOverItemsInline = (fullContent: string, currentDateStr: string): string[] => {
        const dateRegex = /^(\d{4}-\d{2}-\d{2})/gm;
        const indices: {date: string, index: number}[] = [];
        let match;
        while ((match = dateRegex.exec(fullContent)) !== null) {
          indices.push({ date: match[1], index: match.index });
        }
        indices.sort((a, b) => a.index - b.index);
        const currentIndex = indices.findIndex(i => i.date === currentDateStr);
        let prevBlockContent = "";
        if (currentIndex > 0) {
          const prev = indices[currentIndex - 1];
          const curr = indices[currentIndex];
          prevBlockContent = fullContent.substring(prev.index, curr.index);
        } else if (currentIndex === -1 && indices.length > 0) {
          const last = indices[indices.length - 1];
          prevBlockContent = fullContent.substring(last.index);
        } else {
          return [];
        }
        const doingMatch = prevBlockContent.match(/\[DOING\]([\s\S]*?)(\[|$)/);
        if (!doingMatch) return [];
        const lines = doingMatch[1].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('=='));
        return lines.filter(l => !l.toLowerCase().startsWith('x '));
      };

      const carryOver = getCarryOverItemsInline(content, selectedDate);
      const doingContent = carryOver.length > 0 ? carryOver.join('\n') : '';
      const newEntry = `\n\n${selectedDate}\n========================================\n[EVENTS]\n\n[DOING]\n${doingContent}\n\n[DONE]\n\n[NOTES]\n`;
      
      setContent(prev => {
        if (prev.includes(selectedDate)) return prev;
        return prev + newEntry;
      });
    }
  }, [selectedDate, content, isHydratingFromCloud]);

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
    const dateRegex = /^(\d{4}-\d{2}-\d{2})/gm;
    const indices: {date: string, index: number}[] = [];
    let match;
    while ((match = dateRegex.exec(fullContent)) !== null) {
        indices.push({ date: match[1], index: match.index });
    }

    indices.sort((a, b) => a.index - b.index);

    const currentIndex = indices.findIndex(i => i.date === currentDateStr);
    
    let prevBlockContent = "";
    if (currentIndex > 0) {
        const prev = indices[currentIndex - 1];
        const curr = indices[currentIndex];
        prevBlockContent = fullContent.substring(prev.index, curr.index);
    } else if (currentIndex === -1 && indices.length > 0) {
        const last = indices[indices.length - 1];
        prevBlockContent = fullContent.substring(last.index);
    } else {
        return [];
    }

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

  // Silent calendar sync (no alerts, used for auto-refresh)
  const syncCalendarSilently = useCallback(async (provider: OAuthProvider, dateStr: string): Promise<boolean> => {
    if (!isConnected(provider)) {
      return false;
    }

    try {
      const events = await fetchEvents(provider, dateStr);
      if (events.length === 0) {
        return true; // Success, but no events
      }
      
      setContent(prevContent => updateSectionForDate(prevContent, dateStr, 'EVENTS', events));
      return true;
    } catch (error: any) {
      console.error("Silent sync error:", error);
      return false;
    }
  }, []);

  // Generic sync calendar handler (with user feedback)
  const handleSyncCalendar = useCallback(async (provider: OAuthProvider, dateStr: string) => {
    if (!isConnected(provider)) {
      const providerName = provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook';
      alert(`Please connect to ${providerName} in Settings first.`);
      setIsSettingsOpen(true);
      return;
    }

    setIsProcessing(true);
    try {
      const events = await fetchEvents(provider, dateStr);
      if (events.length === 0) {
        alert("No events found for " + dateStr);
        return;
      }
      
      const updatedContent = updateSectionForDate(content, dateStr, 'EVENTS', events);
      setContent(updatedContent);

    } catch (error: any) {
      console.error("Sync Error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Calendar Sync Failed: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  }, [content]);

  // Auto-refresh events when date changes (if calendar is connected)
  useEffect(() => {
    // Skip during hydration
    if (isHydratingFromCloud) return;
    
    // Only auto-sync if connected to Google
    if (isConnected('google')) {
      syncCalendarSilently('google', selectedDate);
    }
  }, [selectedDate, isHydratingFromCloud, syncCalendarSilently]);

  // Auto-refresh events on window focus and visibility change
  useEffect(() => {
    let lastRefresh = Date.now();
    const MIN_REFRESH_INTERVAL = 60000; // At least 1 minute between refreshes

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh > MIN_REFRESH_INTERVAL) {
        if (isConnected('google')) {
          syncCalendarSilently('google', selectedDate);
          lastRefresh = Date.now();
        }
      }
    };

    const handleFocus = () => {
      if (Date.now() - lastRefresh > MIN_REFRESH_INTERVAL) {
        if (isConnected('google')) {
          syncCalendarSilently('google', selectedDate);
          lastRefresh = Date.now();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Periodic refresh every 5 minutes while visible
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && isConnected('google')) {
        syncCalendarSilently('google', selectedDate);
        lastRefresh = Date.now();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
  }, [selectedDate, syncCalendarSilently]);

  // Handle Event Task Addition
  const handleAddEventTask = useCallback((dateStr: string, eventRawLine: string) => {
    setAddTaskModal({ isOpen: true, dateStr, eventRawLine });
  }, []);

  // Handle Toggling items in Visualizer (write back to text)
  const handleToggleItem = useCallback((itemRaw: string) => {
    setContent(prev => {
        const lines = prev.split('\n');
        const index = lines.findIndex(l => l === itemRaw);
        
        if (index !== -1) {
            const line = lines[index];
            if (line.trim().toLowerCase().startsWith('x ')) {
                lines[index] = line.replace(/x /i, '');
            } else {
                const spaces = line.match(/^\s*/)?.[0] || '';
                lines[index] = spaces + 'x ' + line.trim();
            }
            return lines.join('\n');
        }
        return prev;
    });
  }, []);

  const handleDeleteEventSubtask = useCallback((dateStr: string, subtaskRawLine: string) => {
    setContent((prev) => deleteEventSubtask({ content: prev, dateStr, subtaskRawLine }));
  }, []);

  const handleDeleteEvent = useCallback((dateStr: string, eventRawLine: string) => {
    setContent((prev) => deleteEvent({ content: prev, dateStr, eventRawLine }));
  }, []);

  // Derived state
  const user = session?.user ?? null;
  const isAnonymous = isAnonymousUser(user);
  const showAnonymousBanner = isSupabaseConfigured() && isAnonymous && !authLoading;

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-50 text-gray-800 font-sans overflow-hidden">
      {/* Anonymous User Banner */}
      {showAnonymousBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-2 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4" />
          <span>You're using a temporary session. <button onClick={() => setIsSettingsOpen(true)} className="underline font-medium hover:text-amber-900">Create an account</button> to sync across browsers/devices.</span>
        </div>
      )}

      {/* OAuth Success/Error Toast */}
      {oauthMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          oauthMessage.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {oauthMessage.text}
        </div>
      )}

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
            onSyncCalendar={(dateStr) => handleSyncCalendar('google', dateStr)}
            onAddEventTask={handleAddEventTask}
            onDeleteEvent={handleDeleteEvent}
            onDeleteEventSubtask={handleDeleteEventSubtask}
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
        user={user}
        isAnonymous={isAnonymous}
        authLoading={authLoading}
        lastCloudSyncAt={lastCloudSyncAt}
        cloudError={cloudError}
        isHydratingFromCloud={isHydratingFromCloud}
        onSessionChange={(newSession) => setSession(newSession)}
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
