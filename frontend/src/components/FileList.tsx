import React from 'react';
import { 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  Music, 
  Archive, 
  File, 
  ChevronRight, 
  Download, 
  Trash2, 
  Edit3, 
  FolderPlus, 
  Upload, 
  Archive as ZipIcon,
  CheckSquare,
  Square,
  Globe
} from 'lucide-react';
import { FileItem, BreadcrumbItem } from '../types';
import { formatBytes, formatDate, truncateMiddle } from '../utils/format';
import { api } from '../api';

interface FileListProps {
  items: FileItem[];
  currentPath: string;
  storageId: string;
  storageName: string;
  onNavigate: (path: string) => void;
  viewMode: 'grid' | 'list';
  selectedPaths: Set<string>;
  onToggleSelect: (path: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenMedia: (item: FileItem) => void;
  onNewFolder: () => void;
  onUploadClick: () => void;
  onRename: (item: FileItem) => void;
  onDeleteSelected: () => void;
}

export const FileList: React.FC<FileListProps> = ({
  items,
  currentPath,
  storageId,
  storageName,
  onNavigate,
  viewMode,
  selectedPaths,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onOpenMedia,
  onNewFolder,
  onUploadClick,
  onRename,
  onDeleteSelected,
}) => {
  // Build breadcrumb segments
  const pathParts = currentPath.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [
    { name: storageName || '저장소', path: '/' },
    ...pathParts.map((part, index) => ({
      name: part,
      path: '/' + pathParts.slice(0, index + 1).join('/'),
    })),
  ];

  const getFileIcon = (item: FileItem, sizeClass = "w-6 h-6") => {
    if (item.isDir) return <Folder className={`${sizeClass} text-blue-400 fill-blue-400/20`} />;
    switch (item.mediaType) {
      case 'image': return <ImageIcon className={`${sizeClass} text-emerald-400`} />;
      case 'video': return <Film className={`${sizeClass} text-violet-400`} />;
      case 'audio': return <Music className={`${sizeClass} text-pink-400`} />;
      case 'text': return <FileText className={`${sizeClass} text-amber-400`} />;
      case 'archive': return <Archive className={`${sizeClass} text-orange-400`} />;
      default: return <File className={`${sizeClass} text-gray-400`} />;
    }
  };

  const handleItemClick = (item: FileItem, e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onToggleSelect(item.path);
      return;
    }
    if (item.isDir) {
      onNavigate(item.path);
    } else {
      onOpenMedia(item);
    }
  };

  const handleDownloadSingle = (item: FileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = api.getDownloadUrl(item.path, storageId);
  };

  const hasSelection = selectedPaths.size > 0;
  const isAllSelected = items.length > 0 && selectedPaths.size === items.length;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#121217] overflow-hidden">
      {/* Top Toolbar: Breadcrumb & Actions */}
      <div className="h-14 border-b border-[#22222d] px-6 flex items-center justify-between bg-[#15151c]/60 backdrop-blur">
        {/* Breadcrumb Path */}
        <nav className="flex items-center gap-1.5 text-sm overflow-x-auto py-1 scrollbar-none">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.path}>
              {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
              <button
                onClick={() => onNavigate(crumb.path)}
                className={`px-2 py-1 rounded hover:bg-[#232330] transition shrink-0 ${
                  idx === breadcrumbs.length - 1
                    ? 'font-semibold text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {hasSelection ? (
            <div className="flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 px-3 py-1 rounded-lg">
              <span className="text-xs text-blue-400 font-medium">
                {selectedPaths.size}개 선택됨
              </span>
              <button
                onClick={() => {
                  const paths = Array.from(selectedPaths);
                  window.location.href = api.getZipDownloadUrl(paths, storageId);
                }}
                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded font-medium transition"
              >
                <ZipIcon className="w-3.5 h-3.5" />
                ZIP 다운로드
              </button>
              <button
                onClick={onDeleteSelected}
                className="flex items-center gap-1 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 px-2.5 py-1 rounded font-medium transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                삭제
              </button>
              <button
                onClick={onClearSelection}
                className="text-xs text-gray-400 hover:text-gray-200 underline ml-1"
              >
                선택 해제
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={onNewFolder}
                className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white bg-[#1e1e27] hover:bg-[#282835] border border-[#2e2e3d] px-3 py-1.5 rounded-lg transition shadow-sm font-medium"
              >
                <FolderPlus className="w-4 h-4 text-blue-400" />
                새 폴더
              </button>
              <button
                onClick={onUploadClick}
                className="flex items-center gap-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition shadow-sm font-medium shadow-blue-600/20"
              >
                <Upload className="w-4 h-4" />
                파일 업로드
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main File View Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1c1c24] border border-[#292936] flex items-center justify-center text-gray-500 mb-4">
              <Folder className="w-8 h-8 opacity-40" />
            </div>
            <p className="text-gray-300 font-medium text-base">폴더가 비어 있습니다</p>
            <p className="text-gray-500 text-xs mt-1 max-w-sm">
              상단의 [파일 업로드] 버튼을 누르거나 파일을 여기로 드래그 앤 드롭하여 저장하세요.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
            {items.map((item) => {
              const isSelected = selectedPaths.has(item.path);
              return (
                <div
                  key={item.path}
                  onClick={(e) => handleItemClick(item, e)}
                  className={`group relative bg-[#171720] hover:bg-[#1f1f2c] border rounded-xl p-3 flex flex-col items-center text-center cursor-pointer transition select-none ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50'
                      : 'border-[#262633] hover:border-[#38384a]'
                  }`}
                >
                  {/* Selection checkbox */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(item.path);
                    }}
                    className={`absolute top-2.5 left-2.5 p-1 rounded-md transition ${
                      isSelected
                        ? 'text-blue-400 opacity-100'
                        : 'text-gray-400 opacity-0 group-hover:opacity-100 hover:text-white'
                    }`}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </div>

                  {/* Thumbnail / Icon */}
                  <div className="w-16 h-16 my-2 flex items-center justify-center overflow-hidden rounded-lg bg-[#111116]/80">
                    {item.mediaType === 'image' ? (
                      <img
                        src={api.getStreamUrl(item.path, storageId)}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      getFileIcon(item, 'w-10 h-10')
                    )}
                  </div>

                  {/* Name with Smart Middle Truncation */}
                  <span
                    className="text-xs font-medium text-gray-200 w-full text-center px-1 mt-1 break-all"
                    title={item.name}
                  >
                    {truncateMiddle(item.name, 28)}
                  </span>

                  {/* Sub info */}
                  <span className="text-[11px] text-gray-400 mt-0.5 font-mono">
                    {item.isDir ? '폴더' : formatBytes(item.size)}
                  </span>

                  {/* Hover Actions */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    {(item.ext === '.html' || item.ext === '.htm' || item.isDir) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(api.getHostUrl(item.path, storageId), '_blank');
                        }}
                        className="p-1 rounded bg-emerald-600/30 text-emerald-400 hover:text-white hover:bg-emerald-600 transition"
                        title="웹페이지로 열기 (새 탭)"
                      >
                        <Globe className="w-3 h-3" />
                      </button>
                    )}
                    {!item.isDir && (
                      <button
                        onClick={(e) => handleDownloadSingle(item, e)}
                        className="p-1 rounded bg-[#2a2a38] text-gray-300 hover:text-white hover:bg-blue-600 transition"
                        title="다운로드"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRename(item);
                      }}
                      className="p-1 rounded bg-[#2a2a38] text-gray-300 hover:text-white hover:bg-[#38384a] transition"
                      title="이름 변경"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="bg-[#171720] border border-[#252533] rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-2.5 bg-[#1b1b24] border-b border-[#252533] text-xs font-semibold text-gray-400">
              <div className="col-span-6 flex items-center gap-3">
                <button
                  onClick={onSelectAll}
                  className="text-gray-400 hover:text-white"
                >
                  {isAllSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                </button>
                <span>이름</span>
              </div>
              <div className="col-span-2">크기</div>
              <div className="col-span-3">수정 날짜</div>
              <div className="col-span-1 text-right">작업</div>
            </div>

            <div className="divide-y divide-[#21212c]">
              {items.map((item) => {
                const isSelected = selectedPaths.has(item.path);
                return (
                  <div
                    key={item.path}
                    onClick={(e) => handleItemClick(item, e)}
                    className={`grid grid-cols-12 px-4 py-2.5 text-xs items-center cursor-pointer transition select-none ${
                      isSelected
                        ? 'bg-blue-500/10 text-white'
                        : 'hover:bg-[#1e1e28] text-gray-200'
                    }`}
                  >
                    <div className="col-span-6 flex items-center gap-3 min-w-0 pr-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelect(item.path);
                        }}
                        className="text-gray-400 hover:text-white shrink-0"
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                      </button>
                      <span className="shrink-0">{getFileIcon(item, 'w-5 h-5')}</span>
                      <span className="font-medium truncate" title={item.name}>
                        {truncateMiddle(item.name, 60)}
                      </span>
                    </div>

                    <div className="col-span-2 text-gray-400 font-mono">
                      {item.isDir ? '-' : formatBytes(item.size)}
                    </div>

                    <div className="col-span-3 text-gray-400">
                      {formatDate(item.modTime)}
                    </div>

                    <div className="col-span-1 flex items-center justify-end gap-1.5">
                      {(item.ext === '.html' || item.ext === '.htm' || item.isDir) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(api.getHostUrl(item.path, storageId), '_blank');
                          }}
                          className="p-1 text-emerald-400 hover:text-white hover:bg-emerald-600/40 rounded transition"
                          title="웹페이지로 열기 (새 탭)"
                        >
                          <Globe className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!item.isDir && (
                        <button
                          onClick={(e) => handleDownloadSingle(item, e)}
                          className="p-1 text-gray-400 hover:text-blue-400 hover:bg-[#282835] rounded transition"
                          title="다운로드"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRename(item);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-200 hover:bg-[#282835] rounded transition"
                        title="이름 변경"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
