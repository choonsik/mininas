import React, { useEffect, useRef } from 'react';
import { 
  Play, 
  Download, 
  Copy, 
  Scissors, 
  Clipboard, 
  Edit3, 
  Trash2, 
  Info, 
  FolderPlus, 
  Upload, 
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { FileItem } from '../types';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: ContextMenuPosition | null;
  targetItem: FileItem | null;
  clipboard: { action: 'copy' | 'cut'; paths: string[] } | null;
  onClose: () => void;
  onOpen: (item: FileItem) => void;
  onDownload: (item: FileItem) => void;
  onCopy: (item: FileItem) => void;
  onCut: (item: FileItem) => void;
  onMoveTo?: (item: FileItem) => void;
  onPaste: () => void;
  onCancelClipboard?: () => void;
  onRename: (item: FileItem) => void;
  onDelete: (item: FileItem) => void;
  onDetails: (item: FileItem) => void;
  onNewFolder: () => void;
  onUpload: () => void;
  onRefresh: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  position,
  targetItem,
  clipboard,
  onClose,
  onOpen,
  onDownload,
  onCopy,
  onCut,
  onMoveTo,
  onPaste,
  onCancelClipboard,
  onRename,
  onDelete,
  onDetails,
  onNewFolder,
  onUpload,
  onRefresh,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!position) return null;

  // Adjust position to stay inside window viewport
  const menuWidth = 190;
  const menuHeight = targetItem ? 260 : 160;
  const adjustedX = position.x + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 10 : position.x;
  const adjustedY = position.y + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 10 : position.y;

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      className="fixed z-50 min-w-[190px] bg-[#1a1a24] border border-[#2e2e42] rounded-xl shadow-2xl py-1.5 text-xs text-gray-200 select-none backdrop-blur-md animate-scaleUp"
      onClick={(e) => e.stopPropagation()}
    >
      {targetItem ? (
        <>
          <div className="px-3 py-1.5 border-b border-[#28283a] text-gray-400 font-mono truncate max-w-[180px]">
            {targetItem.name}
          </div>

          <button
            onClick={() => { onClose(); onOpen(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-blue-600 hover:text-white transition"
          >
            {targetItem.isDir ? <FolderOpen className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{targetItem.isDir ? '폴더 열기' : '열기 / 재생'}</span>
          </button>

          {!targetItem.isDir && (
            <button
              onClick={() => { onClose(); onDownload(targetItem); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] transition"
            >
              <Download className="w-3.5 h-3.5 text-gray-400" />
              <span>다운로드</span>
            </button>
          )}

          <div className="h-px bg-[#262638] my-1" />

          {onMoveTo && (
            <button
              onClick={() => { onClose(); onMoveTo(targetItem); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] text-amber-400 transition"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>폴더로 이동...</span>
            </button>
          )}

          <button
            onClick={() => { onClose(); onCut(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] transition"
          >
            <Scissors className="w-3.5 h-3.5 text-gray-400" />
            <span className="flex-1">잘라내기</span>
            <span className="text-[10px] text-gray-500 font-mono">⌘X</span>
          </button>

          <button
            onClick={() => { onClose(); onCopy(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] transition"
          >
            <Copy className="w-3.5 h-3.5 text-gray-400" />
            <span className="flex-1">복사</span>
            <span className="text-[10px] text-gray-500 font-mono">⌘C</span>
          </button>

          {clipboard && (
            <div className="flex items-center">
              <button
                onClick={() => { onClose(); onPaste(); }}
                className="flex-1 flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] text-blue-400 transition"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span className="flex-1">붙여넣기</span>
                <span className="text-[10px] text-blue-400/70 font-mono">⌘V</span>
              </button>
              {onCancelClipboard && (
                <button
                  onClick={() => { onClose(); onCancelClipboard(); }}
                  className="px-2 py-2 text-gray-400 hover:text-white hover:bg-[#28283a] transition text-[11px]"
                  title="클립보드 취소"
                >
                  취소
                </button>
              )}
            </div>
          )}

          <div className="h-px bg-[#262638] my-1" />

          <button
            onClick={() => { onClose(); onRename(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] transition"
          >
            <Edit3 className="w-3.5 h-3.5 text-gray-400" />
            <span>이름 변경</span>
          </button>

          <button
            onClick={() => { onClose(); onDetails(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] transition"
          >
            <Info className="w-3.5 h-3.5 text-gray-400" />
            <span>상세 정보</span>
          </button>

          <div className="h-px bg-[#262638] my-1" />

          <button
            onClick={() => { onClose(); onDelete(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-red-400 hover:bg-red-500/20 hover:text-red-300 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="flex-1">삭제</span>
            <span className="text-[10px] text-red-400/60 font-mono">Del</span>
          </button>
        </>
      ) : (
        /* Empty Area Context Menu */
        <>
          <button
            onClick={() => { onClose(); onNewFolder(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] transition"
          >
            <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
            <span>새 폴더 만들기</span>
          </button>

          <button
            onClick={() => { onClose(); onUpload(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] transition"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>파일 업로드</span>
          </button>

          {clipboard && (
            <div className="flex items-center">
              <button
                onClick={() => { onClose(); onPaste(); }}
                className="flex-1 flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] text-blue-400 transition"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span className="flex-1">붙여넣기 ({clipboard.paths.length}개)</span>
                <span className="text-[10px] text-blue-400/70 font-mono">⌘V</span>
              </button>
              {onCancelClipboard && (
                <button
                  onClick={() => { onClose(); onCancelClipboard(); }}
                  className="px-2 py-2 text-gray-400 hover:text-white hover:bg-[#28283a] transition text-[11px]"
                  title="클립보드 취소"
                >
                  취소
                </button>
              )}
            </div>
          )}

          <div className="h-px bg-[#262638] my-1" />

          <button
            onClick={() => { onClose(); onRefresh(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#28283a] transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
            <span>새로고침</span>
          </button>
        </>
      )}
    </div>
  );
};
