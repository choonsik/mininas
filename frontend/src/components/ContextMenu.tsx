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

  const menuWidth = 200;
  const menuHeight = targetItem ? 320 : 160;
  const adjustedX = Math.max(8, Math.min(position.x, window.innerWidth - menuWidth - 8));
  const adjustedY = Math.max(8, Math.min(position.y, window.innerHeight - menuHeight - 8));

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      className="fixed z-50 min-w-[200px] max-w-[calc(100vw-16px)] bg-surface-card border border-surface-border rounded-lg shadow-2xl py-1 text-xs text-content-primary select-none touch-manipulation"
      onClick={(e) => e.stopPropagation()}
    >
      {targetItem ? (
        <>
          <div className="px-3 py-1.5 border-b border-surface-border text-content-muted font-mono truncate max-w-[190px] text-[11px]">
            {targetItem.name}
          </div>

          <button
            onClick={() => { onClose(); onOpen(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 sm:py-1.5 text-left hover:bg-surface-cardHover active:bg-surface-cardHover transition touch-manipulation"
          >
            {targetItem.isDir ? <FolderOpen className="w-3.5 h-3.5 text-content-muted" /> : <Play className="w-3.5 h-3.5 text-content-muted" />}
            <span>{targetItem.isDir ? '폴더 열기' : '열기 / 재생'}</span>
          </button>

          {onPinToSites && (targetItem.isDir || targetItem.ext === '.html' || targetItem.ext === '.htm') && (
            <button
              onClick={() => { onClose(); onPinToSites(targetItem); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 sm:py-1.5 text-left hover:bg-surface-cardHover active:bg-surface-cardHover transition touch-manipulation"
            >
              <Pin className="w-3.5 h-3.5 text-content-muted" />
              <span>사이트 허브에 고정</span>
            </button>
          )}

          {!targetItem.isDir && (
            <button
              onClick={() => { onClose(); onDownload(targetItem); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 sm:py-1.5 text-left hover:bg-surface-cardHover active:bg-surface-cardHover transition touch-manipulation"
            >
              <Download className="w-3.5 h-3.5 text-content-muted" />
              <span>다운로드</span>
            </button>
          )}

          <div className="h-px bg-surface-border my-1" />

          {onMoveTo && (
            <button
              onClick={() => { onClose(); onMoveTo(targetItem); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 sm:py-1.5 text-left hover:bg-surface-cardHover active:bg-surface-cardHover transition touch-manipulation"
            >
              <Scissors className="w-3.5 h-3.5 text-content-muted" />
              <span>폴더로 이동...</span>
            </button>
          )}

          <button
            onClick={() => { onClose(); onCut(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 sm:py-1.5 text-left hover:bg-surface-cardHover active:bg-surface-cardHover transition touch-manipulation"
          >
            <Scissors className="w-3.5 h-3.5 text-content-muted" />
            <span className="flex-1">잘라내기</span>
            <span className="text-[10px] text-content-muted font-mono hidden sm:inline">⌘X</span>
          </button>

          <button
            onClick={() => { onClose(); onCopy(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 sm:py-1.5 text-left hover:bg-surface-cardHover active:bg-surface-cardHover transition touch-manipulation"
          >
            <Copy className="w-3.5 h-3.5 text-content-muted" />
            <span className="flex-1">복사</span>
            <span className="text-[10px] text-content-muted font-mono hidden sm:inline">⌘C</span>
          </button>

          {clipboard && (
            <div className="flex items-center">
              <button
                onClick={() => { onClose(); onPaste(); }}
                className="flex-1 flex items-center gap-2.5 px-3 py-2 sm:py-1.5 text-left hover:bg-surface-cardHover active:bg-surface-cardHover text-accent transition touch-manipulation"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span className="flex-1">붙여넣기</span>
                <span className="text-[10px] text-accent/70 font-mono hidden sm:inline">⌘V</span>
              </button>
              {onCancelClipboard && (
                <button
                  onClick={() => { onClose(); onCancelClipboard(); }}
                  className="px-2 py-2 sm:py-1.5 text-content-muted hover:text-content-primary hover:bg-surface-cardHover transition text-[11px] touch-manipulation"
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
            className="w-full flex items-center gap-2.5 px-3 py-2 sm:py-1.5 text-left hover:bg-surface-cardHover active:bg-surface-cardHover transition touch-manipulation"
          >
            <Edit3 className="w-3.5 h-3.5 text-content-muted" />
            <span>이름 변경</span>
          </button>

          <button
            onClick={() => { onClose(); onDetails(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 sm:py-1.5 text-left hover:bg-surface-cardHover active:bg-surface-cardHover transition touch-manipulation"
          >
            <Info className="w-3.5 h-3.5 text-content-muted" />
            <span>상세 정보</span>
          </button>

          <div className="h-px bg-surface-border my-1" />

          <button
            onClick={() => { onClose(); onDelete(targetItem); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 sm:py-1.5 text-left text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition touch-manipulation"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="flex-1">삭제</span>
            <span className="text-[10px] text-red-400/70 font-mono hidden sm:inline">Del</span>
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
