import React from 'react';
import { 
  X, 
  FileText, 
  HardDrive, 
  Calendar, 
  Layers, 
  Download, 
  Play, 
  ExternalLink,
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
    if (item.isDir) return <Folder className="w-8 h-8 text-blue-400" />;
    switch (item.mediaType) {
      case 'video': return <Film className="w-8 h-8 text-violet-400" />;
      case 'image': return <ImageIcon className="w-8 h-8 text-emerald-400" />;
      case 'audio': return <Music className="w-8 h-8 text-pink-400" />;
      default: return <FileText className="w-8 h-8 text-amber-400" />;
    }
  };

  const downloadUrl = api.getDownloadUrl(item.path, storageId);
  const streamUrl = api.getStreamUrl(item.path, storageId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-[#1c1c26] border border-[#2e2e40] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a3b] bg-[#161620]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#232332]">
              {getItemIcon()}
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {item.isDir ? '폴더 정보' : '파일 상세 정보'}
              </h2>
              <span className="text-xs text-gray-400 font-mono">
                {storageName}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#28283a] rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-sm">
          {/* File Name */}
          <div className="bg-[#14141c] p-3.5 rounded-xl border border-[#252536]">
            <span className="text-xs font-semibold text-gray-400 block mb-1">이름</span>
            <p className="text-gray-100 font-medium break-all select-all">
              {item.name}
            </p>
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#14141c] p-3 rounded-xl border border-[#252536] flex items-start gap-2.5">
              <HardDrive className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] text-gray-400 block">크기</span>
                <span className="text-gray-200 font-medium font-mono text-xs">
                  {item.isDir ? '디렉토리' : `${formatBytes(item.size)} (${item.size.toLocaleString()} bytes)`}
                </span>
              </div>
            </div>

            <div className="bg-[#14141c] p-3 rounded-xl border border-[#252536] flex items-start gap-2.5">
              <Layers className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] text-gray-400 block">유형</span>
                <span className="text-gray-200 font-medium text-xs capitalize">
                  {item.isDir ? '폴더' : `${item.mediaType} (${item.ext || '없음'})`}
                </span>
              </div>
            </div>

            <div className="bg-[#14141c] p-3 rounded-xl border border-[#252536] flex items-start gap-2.5 col-span-2">
              <Calendar className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] text-gray-400 block">최종 수정 일시</span>
                <span className="text-gray-200 font-medium text-xs">
                  {formatDate(item.modTime)}
                </span>
              </div>
            </div>

            <div className="bg-[#14141c] p-3 rounded-xl border border-[#252536] col-span-2">
              <span className="text-[11px] text-gray-400 block mb-0.5">전체 경로</span>
              <p className="text-gray-300 font-mono text-xs break-all select-all">
                {item.path}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#2a2a3b] bg-[#161620] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!item.isDir && (item.mediaType === 'video' || item.mediaType === 'audio' || item.mediaType === 'image') && onOpenMedia && (
              <button
                onClick={() => {
                  onClose();
                  onOpenMedia(item);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                미디어 열기
              </button>
            )}
            {!item.isDir && (
              <a
                href={downloadUrl}
                download
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[#262638] hover:bg-[#34344d] text-gray-200 rounded-lg transition"
              >
                <Download className="w-3.5 h-3.5" />
                다운로드
              </a>
            )}
            {!item.isDir && (item.ext === '.html' || item.ext === '.htm') && (
              <a
                href={api.getHostUrl(item.path, storageId)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 rounded-lg transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                웹 호스팅 열기
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-gray-400 hover:text-white bg-[#222230] hover:bg-[#2b2b3d] rounded-lg transition"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
