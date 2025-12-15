import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, ExternalLink, Settings, LogOut } from 'lucide-react';
import { isConnected, startOAuthFlow, disconnect, OAuthProvider } from '../services/oauth';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setGoogleConnected(isConnected('google'));
      setMicrosoftConnected(isConnected('microsoft'));
      setStatus('idle');
      setStatusMsg('');
    }
  }, [isOpen]);

  const handleConnect = (provider: OAuthProvider) => {
    startOAuthFlow(provider);
  };

  const handleDisconnect = (provider: OAuthProvider) => {
    disconnect(provider);
    if (provider === 'google') {
      setGoogleConnected(false);
    } else {
      setMicrosoftConnected(false);
    }
    setStatus('success');
    setStatusMsg(`Disconnected from ${provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'}`);
  };

  if (!isOpen) return null;

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

          {/* Calendar Connections */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800">Calendar Connections</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Connect your calendars to sync events automatically. Click the refresh icon in the Events section to import events for any date.
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
                  onClick={() => handleDisconnect('google')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => handleConnect('google')}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
                >
                  Sign in with Google
                </button>
              )}
            </div>

            {/* Microsoft Outlook */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-6 h-6">
                    <path fill="#0078D4" d="M21.17 2.06A2.06 2.06 0 0119.11 0H4.89a2.06 2.06 0 00-2.06 2.06v19.88A2.06 2.06 0 004.89 24h14.22a2.06 2.06 0 002.06-2.06V2.06z"/>
                    <path fill="#fff" d="M12 6.5L5.5 10v7.5L12 21l6.5-3.5V10L12 6.5zm0 2.3l4.2 2.3L12 13.4 7.8 11.1l4.2-2.3zm-4.5 3.6l4 2.1v4l-4-2.1v-4zm9 0v4l-4 2.1v-4l4-2.1z"/>
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Microsoft Outlook</div>
                  <div className="text-xs text-gray-500">
                    {microsoftConnected ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Connected
                      </span>
                    ) : (
                      'Not connected'
                    )}
                  </div>
                </div>
              </div>
              {microsoftConnected ? (
                <button
                  onClick={() => handleDisconnect('microsoft')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => handleConnect('microsoft')}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
                >
                  Sign in with Microsoft
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
