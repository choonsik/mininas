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
  Globe,
  Copy,
  Scissors,
  Clipboard,
  Info,
  ArrowUp,
  ArrowDown,
  Sparkles
} from 'lucide-react';
import { FileItem, BreadcrumbItem, ClipboardItem, SortField, SortOrder } from '../types';
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
  onDeleteSingle: (item: FileItem) => void;
  onShowDetails: (item: FileItem) => void;
  clipboard: ClipboardItem | null;
  onCopySelected: () => void;
  onCutSelected: () => void;
  onPaste: () => void;
  onCopyItem: (item: FileItem) => void;
  onCutItem: (item: FileItem) => void;
  onItemContextMenu: (e: React.MouseEvent, item: FileItem) => void;
  onBackgroundContextMenu: (e: React.MouseEvent) => void;
  hasVideos: boolean;
  onSwitchToNetflix: () => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
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
  onDeleteSingle,
  onShowDetails,
  clipboard,
  onCopySelected,
  onCutSelected,
  onPaste,
  onCopyItem,
  onCutItem,
  onItemContextMenu,
  onBackgroundContextMenu,
  hasVideos,
  onSwitchToNetflix,
  sortField,
  sortOrder,
  onSortChange,
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

  const renderSortArrow = (field: SortField) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-blue-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-400" />
    );
  };

  return (
    <div 
      className="flex-1 flex flex-col h-full bg-[#121217] overflow-hidden"
      onContextMenu={onBackgroundContextMenu}
    >
      {/* Top Toolbar: Breadcrumb & Actions */}
      <div className="h-14 border-b border-[#22222d] px-6 flex items-center justify-between bg-[#15151c]/60 backdrop-blur shrink-0">
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
            <div className="flex items-center gap-1.5 bg-blue-600/10 border border-blue-500/20 px-2.5 py-1 rounded-lg">
              <span className="text-xs text-blue-400 font-medium mr-1">
                {selectedPaths.size}개 선택
              </span>

              <button
                onClick={onCopySelected}
                className="flex items-center gap-1 text-xs bg-[#242436] hover:bg-[#32324a] text-gray-200 px-2.5 py-1 rounded font-medium transition"
                title="선택 항목 복사"
              >
                <Copy className="w-3.5 h-3.5 text-blue-400" />
                복사
              </button>

              <button
                onClick={onCutSelected}
                className="flex items-center gap-1 text-xs bg-[#242436] hover:bg-[#32324a] text-gray-200 px-2.5 py-1 rounded font-medium transition"
                title="선택 항목 잘라내기 (이동)"
              >
                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                이동
              </button>

              <button
                onClick={() => {
                  const paths = Array.from(selectedPaths);
                  window.location.href = api.getZipDownloadUrl(paths, storageId);
                }}
                className="flex items-center gap-1 text-xs bg-[#242436] hover:bg-[#32324a] text-gray-200 px-2.5 py-1 rounded font-medium transition"
                title="선택 항목 ZIP 압축 다운로드"
              >
                <ZipIcon className="w-3.5 h-3.5 text-emerald-400" />
                ZIP
              </button>

              <button
                onClick={onDeleteSelected}
                className="flex items-center gap-1 text-xs bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white px-2.5 py-1 rounded font-medium transition"
                title="선택 항목 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
                삭제
              </button>

              <button
                onClick={onClearSelection}
                className="text-xs text-gray-400 hover:text-white px-1.5 py-1"
                title="선택 해제"
              >
                취소
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {clipboard && (
                <button
                  onClick={onPaste}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium shadow-sm transition animate-pulse"
                  title={`${clipboard.paths.length}개 항목 붙여넣기`}
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  붙여넣기 ({clipboard.paths.length})
                </button>
              )}

              <button
                onClick={onNewFolder}
                className="flex items-center gap-1.5 text-xs bg-[#1f1f2a] hover:bg-[#282837] text-gray-200 border border-[#2b2b3a] px-3 py-1.5 rounded-lg font-medium transition"
              >
                <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
                새 폴더
              </button>
              <button
                onClick={onUploadClick}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg font-medium shadow-sm transition"
              >
                <Upload className="w-3.5 h-3.5" />
                파일 업로드
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Netflix Mode Banner (Appears when folder contains videos) */}
      {hasVideos && (
        <div className="bg-gradient-to-r from-red-950/60 via-[#1c1417] to-neutral-900 border-b border-red-900/40 px-6 py-2.5 flex items-center justify-between text-xs animate-fadeIn shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-1 rounded bg-red-600 text-white shadow-md">
              <Film className="w-3.5 h-3.5" />
            </span>
            <span className="text-gray-200">
              <strong className="text-white font-semibold">동영상 폴더 감지:</strong> 이 폴더는 넷플릭스 스타일 시네마 뷰로 편리하게 감상할 수 있습니다.
            </span>
          </div>
          <button
            onClick={onSwitchToNetflix}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold tracking-tight shadow-md shadow-red-900/40 transition active:scale-95"
          >
            <Sparkles className="w-3 h-3" />
            넷플릭스 뷰로 보기
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-[#252535]">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-[#181822] flex items-center justify-center border border-[#232332]">
              <Folder className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-sm font-medium">폴더가 비어 있습니다</p>
            <p className="text-xs text-gray-600">파일을 드래그하여 업로드하거나 상단 버튼을 사용하세요</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {items.map((item) => {
              const isSelected = selectedPaths.has(item.path);
              const isCut = clipboard?.action === 'cut' && clipboard.paths.includes(item.path);
              return (
                <div
                  key={item.path}
                  onClick={(e) => handleItemClick(item, e)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    onItemContextMenu(e, item);
                  }}
                  className={`group relative flex flex-col items-center p-3.5 rounded-xl border transition cursor-pointer select-none ${
                    isSelected
                      ? 'bg-blue-600/10 border-blue-500/50 shadow-md shadow-blue-500/10'
                      : 'bg-[#171720]/80 border-[#232330] hover:bg-[#1f1f2b] hover:border-[#333346]'
                  } ${isCut ? 'opacity-50 border-dashed border-amber-500' : ''}`}
                >
                  {/* Selection Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(item.path);
                    }}
                    className={`absolute top-2 left-2 p-1 rounded transition z-10 ${
                      isSelected ? 'opacity-100 text-blue-400' : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white'
                    }`}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>

                  {/* Icon or Image/Video Preview */}
                  <div className="w-16 h-16 my-2 flex items-center justify-center relative">
                    {item.mediaType === 'image' ? (
                      <img
                        src={api.getStreamUrl(item.path, storageId)}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover rounded-lg shadow-sm"
                      />
                    ) : (
                      getFileIcon(item, 'w-12 h-12')
                    )}
                  </div>

                  {/* File Name */}
                  <span 
                    className="text-xs text-gray-200 font-medium text-center truncate w-full px-1 group-hover:text-white"
                    title={item.name}
                  >
                    {truncateMiddle(item.name, 22)}
                  </span>

                  {/* Size or Dir flag */}
                  <span className="text-[10px] text-gray-400 font-mono mt-1">
                    {item.isDir ? '폴더' : formatBytes(item.size)}
                  </span>

                  {/* Hover Quick Actions */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowDetails(item);
                      }}
                      className="p-1 rounded bg-[#2a2a38] text-gray-300 hover:text-white hover:bg-[#38384a] transition"
                      title="상세 정보"
                    >
                      <Info className="w-3 h-3" />
                    </button>
                    {!item.isDir && (
                      <button
                        onClick={(e) => handleDownloadSingle(item, e)}
                        className="p-1 rounded bg-[#2a2a38] text-gray-300 hover:text-blue-400 hover:bg-[#38384a] transition"
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSingle(item);
                      }}
                      className="p-1 rounded bg-[#2a2a38] text-red-400 hover:text-red-300 hover:bg-red-500/20 transition"
                      title="삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="bg-[#171720] border border-[#252533] rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-2.5 bg-[#1b1b24] border-b border-[#252533] text-xs font-semibold text-gray-400 select-none">
              <div className="col-span-6 flex items-center gap-3">
                <button
                  onClick={onSelectAll}
                  className="text-gray-400 hover:text-white"
                >
                  {isAllSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => onSortChange('name')}
                  className="flex items-center gap-1 hover:text-white transition"
                >
                  <span>이름</span>
                  {renderSortArrow('name')}
                </button>
              </div>

              <div className="col-span-2">
                <button
                  onClick={() => onSortChange('size')}
                  className="flex items-center gap-1 hover:text-white transition"
                >
                  <span>크기</span>
                  {renderSortArrow('size')}
                </button>
              </div>

              <div className="col-span-3">
                <button
                  onClick={() => onSortChange('date')}
                  className="flex items-center gap-1 hover:text-white transition"
                >
                  <span>수정 날짜</span>
                  {renderSortArrow('date')}
                </button>
              </div>

              <div className="col-span-1 text-right">작업</div>
            </div>

            <div className="divide-y divide-[#21212c]">
              {items.map((item) => {
                const isSelected = selectedPaths.has(item.path);
                const isCut = clipboard?.action === 'cut' && clipboard.paths.includes(item.path);
                return (
                  <div
                    key={item.path}
                    onClick={(e) => handleItemClick(item, e)}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      onItemContextMenu(e, item);
                    }}
                    className={`grid grid-cols-12 px-4 py-2.5 text-xs items-center cursor-pointer transition select-none ${
                      isSelected
                        ? 'bg-blue-500/10 text-white'
                        : 'hover:bg-[#1e1e28] text-gray-200'
                    } ${isCut ? 'opacity-50' : ''}`}
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

                    <div className="col-span-1 flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowDetails(item);
                        }}
                        className="p-1 text-gray-400 hover:text-gray-200 hover:bg-[#282835] rounded transition"
                        title="상세 정보"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSingle(item);
                        }}
                        className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded transition"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
