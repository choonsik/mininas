import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FileItem } from '../types';

interface RenameModalProps {
  item: FileItem | null;
  onClose: () => void;
  onRename: (newName: string) => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({ item, onClose, onRename }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (item) setName(item.name);
  }, [item]);

  if (!item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name === item.name) return;
    onRename(name.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-surface-card border border-surface-border rounded-lg max-w-sm w-full p-5 shadow-xl relative text-content-primary">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-content-muted hover:text-content-primary p-1 rounded transition"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="font-semibold text-sm mb-3">이름 변경</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-surface-base border border-surface-border rounded-md px-3 py-1.5 text-xs text-content-primary placeholder-content-muted focus:border-accent focus:outline-none transition"
          />

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-md text-xs text-content-secondary hover:text-content-primary hover:bg-surface-cardHover transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name === item.name}
              className="px-3.5 py-1 rounded-md text-xs font-medium bg-accent-btn hover:bg-accent-btnHover text-accent-btnText border border-accent-btnBorder transition disabled:opacity-40"
            >
              변경
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
