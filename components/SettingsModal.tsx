import React, { useState, useEffect } from 'react';
import { X, Save, LogIn, CheckCircle, AlertCircle, ExternalLink, Settings } from 'lucide-react';
import { getStoredConfig, saveConfig, initGoogleClient, handleAuthClick } from '../services/googleCalendar';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [clientId, setClientId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      const config = getStoredConfig();
      setClientId(config.clientId);
      setApiKey(config.apiKey);
    }
  }, [isOpen]);

  const handleSave = async () => {
    saveConfig(clientId, apiKey);
    setStatus('idle');
    setStatusMsg('Configuration saved. Initializing...');
    
    try {
      await initGoogleClient();
      setStatus('success');
      setStatusMsg('Configuration saved and initialized!');
    } catch (e: any) {
      setStatus('error');
      setStatusMsg('Failed to initialize: ' + e.message);
    }
  };

  const handleConnect = async () => {
    try {
      await handleAuthClick();
      setStatus('success');
      setStatusMsg('Successfully connected to Google Calendar!');
    } catch (e: any) {
      setStatus('error');
      setStatusMsg('Connection failed: ' + e.message);
    }
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

          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              Google Calendar Integration
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              To sync your calendar, you need to provide your Google Cloud Project credentials. 
              Currently, this runs entirely in your browser.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Google Client ID
                </label>
                <input 
                  type="text" 
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="123456789-abc.apps.googleusercontent.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  API Key
                </label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
              >
                <Save className="w-4 h-4" />
                Save Config
              </button>
              
              <button 
                onClick={handleConnect}
                disabled={!clientId}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogIn className="w-4 h-4" />
                Connect / Auth
              </button>
            </div>

            <div className="text-xs text-gray-400 pt-2 border-t border-gray-100 mt-4">
              <p>Don't have credentials? <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">Go to Google Cloud Console <ExternalLink className="w-3 h-3"/></a></p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Create a project</li>
                <li>Enable <strong>Google Calendar API</strong></li>
                <li>Create <strong>OAuth Client ID</strong> (Web Application)</li>
                <li>Create <strong>API Key</strong></li>
                <li>Add origin and redirect URI (usually your current URL)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
