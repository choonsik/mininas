import React from 'react';
import { 
  X, 
  FileText, 
  HardDrive, 
  Calendar, 
  Layers, 
  Download, 
  Play, 
  Film, 
  Music, 
  Image as ImageIcon, 
  Folder 
} from 'lucide-react';
import { FileItem } from '../types';
import { formatBytes, formatDate } from '../utils/format';
import { api } from '../api';

interface FileDetailsModalProps {
  item: FileItem | null;
  storageId: string;
  storageName: string;
  onClose: () => void;
  onOpenMedia?: (item: FileItem) => void;
}

export const FileDetailsModal: React.FC<FileDetailsModalProps> = ({
  item,
  storageId,
  storageName,
  onClose,
  onOpenMedia,
}) => {
  if (!item) return null;

  const getItemIcon = () => {
    if (item.isDir) return <Folder className="w-6 h-6 text-accent" />;
    switch (item.mediaType) {
      case 'video': return <Film className="w-6 h-6 text-indigo-400" />;
      case 'image': return <ImageIcon className="w-6 h-6 text-emerald-400" />;
      case 'audio': return <Music className="w-6 h-6 text-pink-400" />;
      default: return <FileText className="w-6 h-6 text-amber-400" />;
    }
  };

  const downloadUrl = api.getDownloadUrl(item.path, storageId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
      <div 
        className="bg-surface-card border border-surface-border rounded-lg w-full max-w-md shadow-xl overflow-hidden text-content-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-border bg-surface-header">
          <div className="flex items-center gap-2.5">
            {getItemIcon()}
            <div>
              <h2 className="text-sm font-semibold leading-tight">
                {item.isDir ? '폴더 정보' : '파일 정보'}
              </h2>
              <span className="text-[11px] text-content-muted font-mono">
                {storageName}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-content-muted hover:text-content-primary hover:bg-surface-cardHover rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3 text-xs">
          <div className="bg-surface-base p-3 rounded border border-surface-borderSubtle">
            <span className="text-[11px] text-content-muted block mb-0.5">이름</span>
            <p className="font-medium break-all select-all text-content-primary">
              {item.name}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-surface-base p-2.5 rounded border border-surface-borderSubtle flex items-start gap-2">
              <HardDrive className="w-3.5 h-3.5 text-content-muted shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-content-muted block">크기</span>
                <span className="font-mono text-[11px]">
                  {item.isDir ? '디렉토리' : formatBytes(item.size)}
                </span>
              </div>
            </div>

            <div className="bg-surface-base p-2.5 rounded border border-surface-borderSubtle flex items-start gap-2">
              <Layers className="w-3.5 h-3.5 text-content-muted shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-content-muted block">종류</span>
                <span className="text-[11px] capitalize">
                  {item.isDir ? '폴더' : `${item.mediaType} (${item.ext || '없음'})`}
                </span>
              </div>
            </div>

            <div className="bg-surface-base p-2.5 rounded border border-surface-borderSubtle flex items-start gap-2 col-span-2">
              <Calendar className="w-3.5 h-3.5 text-content-muted shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-content-muted block">수정일시</span>
                <span className="text-[11px]">
                  {formatDate(item.modTime)}
                </span>
              </div>
            </div>

            <div className="bg-surface-base p-2.5 rounded border border-surface-borderSubtle col-span-2">
              <span className="text-[10px] text-content-muted block mb-0.5">경로</span>
              <p className="font-mono text-[11px] text-content-secondary break-all select-all">
                {item.path}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-surface-border bg-surface-header flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {!item.isDir && (item.mediaType === 'video' || item.mediaType === 'audio' || item.mediaType === 'image') && onOpenMedia && (
              <button
                onClick={() => {
                  onClose();
                  onOpenMedia(item);
                }}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded transition"
              >
                <Play className="w-3 h-3 fill-white" />
                열기
              </button>
            )}
            {!item.isDir && (
              <a
                href={downloadUrl}
                download
                className="flex items-center gap-1.5 px-3 py-1 text-xs text-content-secondary hover:text-content-primary bg-surface-base hover:bg-surface-cardHover border border-surface-border rounded transition"
              >
                <Download className="w-3 h-3" />
                다운로드
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs text-content-secondary hover:text-content-primary rounded transition"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
