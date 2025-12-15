import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, PlusCircle } from 'lucide-react';

interface AddEventTaskModalProps {
  isOpen: boolean;
  eventLabel: string;
  onClose: () => void;
  onSubmit: (taskName: string) => void;
}

const AddEventTaskModal: React.FC<AddEventTaskModalProps> = ({
  isOpen,
  eventLabel,
  onClose,
  onSubmit
}) => {
  const [taskName, setTaskName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedLabel = useMemo(() => eventLabel.trim(), [eventLabel]);

  useEffect(() => {
    if (!isOpen) return;
    setTaskName('');
    // Focus after paint
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const trimmed = taskName.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        // Clicking the backdrop closes; clicking the panel should not.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-900">
            <PlusCircle className="w-5 h-5" />
            <div className="flex flex-col">
              <h2 className="text-lg font-bold">Add task for event</h2>
              <div className="text-xs text-gray-500 font-mono truncate max-w-[28rem]" title={trimmedLabel}>
                {trimmedLabel || '(Unknown event)'}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Task
            </label>
            <input
              ref={inputRef}
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="e.g. Draft agenda"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              <PlusCircle className="w-4 h-4" />
              Add to Doing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddEventTaskModal;


