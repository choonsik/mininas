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
  FolderOpen,
  Pin
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
  onPinToSites?: (item: FileItem) => void;
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
  onPinToSites,
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

  const menuWidth = 180;
  const menuHeight = targetItem ? 250 : 150;
  const adjustedX = position.x + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 10 : position.x;
  const adjustedY = position.y + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 10 : position.y;

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      className="fixed z-50 min-w-[180px] bg-surface-card border border-surface-border rounded-md shadow-xl py-1 text-xs text-content-primary select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {targetItem ? (
        <>
          <div className="px-3 py-1 border-b border-surface-border text-content-muted font-mono truncate max-w-[170px] text-[11px]">
            {targetItem.name}
          </div>

          <button
            onClick={() => { onClose(); onOpen(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
          >
            {targetItem.isDir ? <FolderOpen className="w-3.5 h-3.5 text-content-muted" /> : <Play className="w-3.5 h-3.5 text-content-muted" />}
            <span>{targetItem.isDir ? '폴더 열기' : '열기 / 재생'}</span>
          </button>

          {onPinToSites && (targetItem.isDir || targetItem.ext === '.html' || targetItem.ext === '.htm') && (
            <button
              onClick={() => { onClose(); onPinToSites(targetItem); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
            >
              <Pin className="w-3.5 h-3.5 text-content-muted" />
              <span>사이트 허브에 고정</span>
            </button>
          )}

          {!targetItem.isDir && (
            <button
              onClick={() => { onClose(); onDownload(targetItem); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
            >
              <Download className="w-3.5 h-3.5 text-content-muted" />
              <span>다운로드</span>
            </button>
          )}

          <div className="h-px bg-surface-border my-1" />

          {onMoveTo && (
            <button
              onClick={() => { onClose(); onMoveTo(targetItem); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
            >
              <Scissors className="w-3.5 h-3.5 text-content-muted" />
              <span>폴더로 이동...</span>
            </button>
          )}

          <button
            onClick={() => { onClose(); onCut(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
          >
            <Scissors className="w-3.5 h-3.5 text-content-muted" />
            <span className="flex-1">잘라내기</span>
            <span className="text-[10px] text-content-muted font-mono">⌘X</span>
          </button>

          <button
            onClick={() => { onClose(); onCopy(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
          >
            <Copy className="w-3.5 h-3.5 text-content-muted" />
            <span className="flex-1">복사</span>
            <span className="text-[10px] text-content-muted font-mono">⌘C</span>
          </button>

          {clipboard && (
            <div className="flex items-center">
              <button
                onClick={() => { onClose(); onPaste(); }}
                className="flex-1 flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover text-accent transition"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span className="flex-1">붙여넣기</span>
                <span className="text-[10px] text-accent/70 font-mono">⌘V</span>
              </button>
              {onCancelClipboard && (
                <button
                  onClick={() => { onClose(); onCancelClipboard(); }}
                  className="px-2 py-1.5 text-content-muted hover:text-content-primary hover:bg-surface-cardHover transition text-[11px]"
                  title="클립보드 취소"
                >
                  취소
                </button>
              )}
            </div>
          )}

          <div className="h-px bg-surface-border my-1" />

          <button
            onClick={() => { onClose(); onRename(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
          >
            <Edit3 className="w-3.5 h-3.5 text-content-muted" />
            <span>이름 변경</span>
          </button>

          <button
            onClick={() => { onClose(); onDetails(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
          >
            <Info className="w-3.5 h-3.5 text-content-muted" />
            <span>상세 정보</span>
          </button>

          <div className="h-px bg-surface-border my-1" />

          <button
            onClick={() => { onClose(); onDelete(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-red-400 hover:bg-red-500/10 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="flex-1">삭제</span>
            <span className="text-[10px] text-red-400/70 font-mono">Del</span>
          </button>
        </>
      ) : (
        /* Empty Area Context Menu */
        <>
          <button
            onClick={() => { onClose(); onNewFolder(); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
          >
            <FolderPlus className="w-3.5 h-3.5 text-content-muted" />
            <span>새 폴더 만들기</span>
          </button>

          <button
            onClick={() => { onClose(); onUpload(); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
          >
            <Upload className="w-3.5 h-3.5 text-content-muted" />
            <span>파일 업로드</span>
          </button>

          {clipboard && (
            <div className="flex items-center">
              <button
                onClick={() => { onClose(); onPaste(); }}
                className="flex-1 flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover text-accent transition"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span className="flex-1">붙여넣기 ({clipboard.paths.length}개)</span>
                <span className="text-[10px] text-accent/70 font-mono">⌘V</span>
              </button>
              {onCancelClipboard && (
                <button
                  onClick={() => { onClose(); onCancelClipboard(); }}
                  className="px-2 py-1.5 text-content-muted hover:text-content-primary hover:bg-surface-cardHover transition text-[11px]"
                  title="클립보드 취소"
                >
                  취소
                </button>
              )}
            </div>
          )}

          <div className="h-px bg-surface-border my-1" />

          <button
            onClick={() => { onClose(); onRefresh(); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-cardHover transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-content-muted" />
            <span>새로고침</span>
          </button>
        </>
      )}
    </div>
  );
};
