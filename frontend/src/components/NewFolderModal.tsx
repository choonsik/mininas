import React, { useState } from 'react';
import { FolderPlus, X } from 'lucide-react';

interface NewFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export const NewFolderModal: React.FC<NewFolderModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [folderName, setFolderName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    onCreate(folderName.trim());
    setFolderName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1c1c24] border border-[#2d2d3d] rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white p-1">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-lg bg-blue-600/10 text-blue-400">
            <FolderPlus className="w-5 h-5" />
          </div>
          <h3 className="text-white font-semibold text-base">새 폴더 만들기</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              autoFocus
              placeholder="폴더 이름 입력"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="w-full bg-[#15151c] border border-[#333344] rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-[#252533] transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!folderName.trim()}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50"
            >
              생성
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
