import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, ExternalLink, Settings, LogOut, User as UserIcon, Mail, Loader2 } from 'lucide-react';
import { isConnected, startOAuthFlow, disconnect, refreshOAuthStatus } from '../services/oauth';
import {
  isSupabaseConfigured,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getSupabase,
} from '../services/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isAnonymous: boolean;
  authLoading: boolean;
  lastCloudSyncAt: number | null;
  cloudError: string | null;
  isHydratingFromCloud: boolean;
  onSessionChange: (session: Session | null) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  isAnonymous,
  authLoading,
  lastCloudSyncAt,
  cloudError,
  isHydratingFromCloud,
  onSessionChange,
}) => {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  // Auth form state
  const [authMode, setAuthMode] = useState<'idle' | 'signin' | 'signup'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Refresh status from backend (best-effort), then update local UI flag
      refreshOAuthStatus()
        .catch(() => null)
        .finally(() => setGoogleConnected(isConnected('google')));
      setStatus('idle');
      setStatusMsg('');
      setAuthMode('idle');
      setEmail('');
      setPassword('');
    }
  }, [isOpen]);

  const handleCalendarConnect = async () => {
    try {
      await startOAuthFlow('google');
    } catch (e: any) {
      setStatus('error');
      setStatusMsg(e?.message || 'Failed to start Google OAuth flow');
    }
  };

  const handleCalendarDisconnect = async () => {
    await disconnect('google');
    setGoogleConnected(false);
    setStatus('success');
    setStatusMsg('Disconnected from Google Calendar');
  };

  const handleGoogleSignIn = async () => {
    setAuthSubmitting(true);
    const { error } = await signInWithGoogle();
    setAuthSubmitting(false);
    if (error) {
      setStatus('error');
      setStatusMsg(error.message);
    }
    // On success, the page will redirect to Google
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setAuthSubmitting(true);
    setStatus('idle');
    setStatusMsg('');

    try {
      if (authMode === 'signup') {
        const { user: newUser, error } = await signUpWithEmail(email, password);
        if (error) throw error;
        if (newUser) {
          setStatus('success');
          setStatusMsg('Account created! Check your email to confirm.');
        }
      } else {
        const { user: signedInUser, error } = await signInWithEmail(email, password);
        if (error) throw error;
        if (signedInUser) {
          setStatus('success');
          setStatusMsg('Signed in successfully!');
          // Session will update via auth listener
        }
      }
    } catch (err: any) {
      setStatus('error');
      setStatusMsg(err?.message || 'Authentication failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setAuthSubmitting(true);
    const { error } = await signOut();
    setAuthSubmitting(false);
    if (error) {
      setStatus('error');
      setStatusMsg(error.message);
    } else {
      setStatus('success');
      setStatusMsg('Signed out. Your local notes are still saved.');
      onSessionChange(null);
    }
  };

  if (!isOpen) return null;

  const supabaseConfigured = isSupabaseConfigured();
  const userEmail = user?.email;
  const showAuthSection = supabaseConfigured;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-900">
            <Settings className="w-5 h-5" />
            <h2 className="text-lg font-bold">Settings</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Status Banner */}
          {statusMsg && (
            <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${status === 'success' ? 'bg-green-50 text-green-700' : status === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
              {status === 'success' ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : status === 'error' ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <Settings className="w-4 h-4 mt-0.5 shrink-0" />}
              <p>{statusMsg}</p>
            </div>
          )}

          {/* Account Section */}
          {showAuthSection && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800">Account</h3>
              
              {authLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : user && !isAnonymous ? (
                // Logged in with real account
                <div className="p-4 border border-gray-200 rounded-lg space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{userEmail || 'Signed in'}</div>
                      <div className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Syncing to cloud
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-500">
                    {isHydratingFromCloud ? (
                      'Loading from cloud...'
                    ) : lastCloudSyncAt ? (
                      `Last synced: ${new Date(lastCloudSyncAt).toLocaleString()}`
                    ) : (
                      'Not synced yet'
                    )}
                    {cloudError && <div className="text-red-600 mt-1">Error: {cloudError}</div>}
                  </div>

                  <button
                    onClick={handleSignOut}
                    disabled={authSubmitting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              ) : (
                // Anonymous or no user
                <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg space-y-4">
                  <div className="text-sm text-amber-800">
                    <strong>Temporary session.</strong> Create an account to sync your notes across browsers and devices.
                  </div>

                  {authMode === 'idle' ? (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleGoogleSignIn}
                        disabled={authSubmitting}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Continue with Google
                      </button>
                      <button
                        onClick={() => setAuthMode('signup')}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                      >
                        <Mail className="w-4 h-4" />
                        Sign up with Email
                      </button>
                      <button
                        onClick={() => setAuthMode('signin')}
                        className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        Already have an account? Sign in
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleEmailSubmit} className="space-y-3">
                      <div className="text-sm font-medium text-gray-700">
                        {authMode === 'signup' ? 'Create account' : 'Sign in'}
                      </div>
                      <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                        required
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                        required
                        minLength={6}
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={authSubmitting}
                          className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
                        >
                          {authSubmitting ? 'Please wait...' : authMode === 'signup' ? 'Create account' : 'Sign in'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthMode('idle')}
                          className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                      {authMode === 'signup' && (
                        <button
                          type="button"
                          onClick={() => setAuthMode('signin')}
                          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                        >
                          Already have an account? Sign in
                        </button>
                      )}
                      {authMode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => setAuthMode('signup')}
                          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                        >
                          Need an account? Sign up
                        </button>
                      )}
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Calendar Connection */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800">Calendar Connection</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Connect your calendar to sync events automatically. Click the refresh icon in the Events section to import events for any date.
            </p>

            {/* Google Calendar */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-6 h-6">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Google Calendar</div>
                  <div className="text-xs text-gray-500">
                    {googleConnected ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Connected
                      </span>
                    ) : (
                      'Not connected'
                    )}
                  </div>
                </div>
              </div>
              {googleConnected ? (
                <button
                  onClick={handleCalendarDisconnect}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleCalendarConnect}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
                >
                  Sign in with Google
                </button>
              )}
            </div>
          </div>

          {/* Help */}
          <div className="text-xs text-gray-400 pt-2 border-t border-gray-100 mt-4">
            <p className="flex items-center gap-1">
              Need help? <a href="https://github.com/zaycruz2/better-note-taking" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">View documentation <ExternalLink className="w-3 h-3"/></a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
