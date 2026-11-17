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
  MoreVertical
} from 'lucide-react';
import { FileItem, BreadcrumbItem, ClipboardItem, SortField, SortOrder } from '../types';
import { formatBytes, formatDate, truncateMiddle } from '../utils/format';
import { api } from '../api';
import { VideoThumbnail } from './VideoThumbnail';

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
  onOpenMoveModal: () => void;
  onPaste: () => void;
  onCancelClipboard: () => void;
  onCopyItem: (item: FileItem) => void;
  onCutItem: (item: FileItem) => void;
  onItemContextMenu: (e: React.MouseEvent, item: FileItem) => void;
  onBackgroundContextMenu: (e: React.MouseEvent) => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
  searchQuery?: string;
  onClearSearch?: () => void;
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
  onOpenMoveModal,
  onPaste,
  onCancelClipboard,
  onItemContextMenu,
  onBackgroundContextMenu,
  sortField,
  sortOrder,
  onSortChange,
  searchQuery = '',
  onClearSearch,
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
    if (item.isDir) return <Folder className={`${sizeClass} text-accent fill-accent/15`} />;
    switch (item.mediaType) {
      case 'image': return <ImageIcon className={`${sizeClass} text-emerald-400`} />;
      case 'video': return <Film className={`${sizeClass} text-indigo-400`} />;
      case 'audio': return <Music className={`${sizeClass} text-pink-400`} />;
      case 'text': return <FileText className={`${sizeClass} text-amber-400`} />;
      case 'archive': return <Archive className={`${sizeClass} text-orange-400`} />;
      default: return <File className={`${sizeClass} text-content-muted`} />;
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
      <ArrowUp className="w-3 h-3 text-accent" />
    ) : (
      <ArrowDown className="w-3 h-3 text-accent" />
    );
  };

  return (
    <div 
      className="flex-1 flex flex-col h-full bg-surface-base overflow-hidden"
      onContextMenu={onBackgroundContextMenu}
    >
      {/* Top Toolbar: Breadcrumb & Actions */}
      <div className="h-12 border-b border-surface-border px-4 sm:px-5 flex items-center justify-between bg-surface-base shrink-0 gap-3">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none min-w-0">
          <nav className="flex items-center gap-1 text-xs shrink-0">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.path}>
                {idx > 0 && <ChevronRight className="w-3 h-3 text-content-muted shrink-0" />}
                <button
                  onClick={() => onNavigate(crumb.path)}
                  className={`px-1.5 py-0.5 rounded transition shrink-0 truncate max-w-[140px] sm:max-w-none ${
                    idx === breadcrumbs.length - 1
                      ? 'font-medium text-content-primary'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {hasSelection ? (
            <div className="flex items-center gap-1.5 bg-surface-card border border-surface-border px-2 py-1 rounded-md text-xs">
              <span className="text-content-secondary font-medium px-1">
                {selectedPaths.size}개 선택
              </span>

              <div className="w-px h-3.5 bg-surface-border mx-0.5" />

              <button
                onClick={onOpenMoveModal}
                className="flex items-center gap-1 text-content-secondary hover:text-content-primary px-1.5 py-0.5 rounded transition"
                title="폴더로 이동"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span className="hidden md:inline">이동</span>
              </button>

              <button
                onClick={onCopySelected}
                className="flex items-center gap-1 text-content-secondary hover:text-content-primary px-1.5 py-0.5 rounded transition"
                title="선택 항목 복사"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden md:inline">복사</span>
              </button>

              <button
                onClick={onCutSelected}
                className="flex items-center gap-1 text-content-secondary hover:text-content-primary px-1.5 py-0.5 rounded transition"
                title="선택 항목 잘라내기"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span className="hidden md:inline">잘라내기</span>
              </button>

              <button
                onClick={() => {
                  const paths = Array.from(selectedPaths);
                  window.location.href = api.getZipDownloadUrl(paths, storageId);
                }}
                className="flex items-center gap-1 text-content-secondary hover:text-content-primary px-1.5 py-0.5 rounded transition"
                title="ZIP 압축 다운로드"
              >
                <ZipIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ZIP</span>
              </button>

              <button
                onClick={onDeleteSelected}
                className="flex items-center gap-1 text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded transition"
                title="선택 항목 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">삭제</span>
              </button>

              <button
                onClick={onClearSelection}
                className="text-content-muted hover:text-content-primary px-1 py-0.5 transition"
                title="선택 해제"
              >
                취소
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {clipboard && (
                <div className="flex items-center gap-1.5 bg-surface-card border border-surface-border px-2 py-1 rounded-md text-xs">
                  <span className="text-content-secondary font-mono text-[11px]">
                    {clipboard.paths.length}개 대기
                  </span>
                  <button
                    onClick={onPaste}
                    className="flex items-center gap-1 text-accent font-medium hover:underline px-1 py-0.5"
                    title="붙여넣기"
                  >
                    <Clipboard className="w-3 h-3" />
                    <span>붙여넣기</span>
                  </button>
                  <button
                    onClick={onCancelClipboard}
                    className="text-content-muted hover:text-content-primary px-1"
                    title="취소"
                  >
                    ×
                  </button>
                </div>
              )}

              <button
                onClick={onNewFolder}
                className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-primary bg-surface-card hover:bg-surface-cardHover border border-surface-border px-2.5 py-1 rounded-md transition"
                title="새 폴더 생성"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">새 폴더</span>
              </button>

              <button
                onClick={onUploadClick}
                className="flex items-center gap-1.5 text-xs bg-accent-btn hover:bg-accent-btnHover text-accent-btnText border border-accent-btnBorder px-2.5 py-1 rounded-md transition font-medium"
                title="파일 업로드"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">업로드</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-content-muted space-y-2 py-16">
            <Folder className="w-10 h-10 stroke-[1.25] text-content-muted opacity-40 mb-1" />
            <p className="text-xs font-medium text-content-secondary">
              {searchQuery.trim() ? `검색 결과가 없습니다: '${searchQuery}'` : '폴더가 비어 있습니다'}
            </p>
            {searchQuery.trim() && onClearSearch && (
              <button
                type="button"
                onClick={onClearSearch}
                className="px-2.5 py-1 rounded bg-surface-card hover:bg-surface-cardHover text-content-secondary text-xs transition border border-surface-border"
              >
                검색 초기화
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* Clean Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-3">
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
                  className={`group relative flex flex-col items-center p-3 rounded-lg border transition cursor-pointer select-none ${
                    isSelected
                      ? 'bg-accent-subtle border-accent/40 text-content-primary'
                      : 'bg-surface-card/40 border-transparent hover:bg-surface-cardHover hover:border-surface-border text-content-primary'
                  } ${isCut ? 'opacity-40' : ''}`}
                >
                  {/* Selection Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelect(item.path);
                    }}
                    className={`absolute top-2 left-2 p-0.5 rounded transition z-10 ${
                      isSelected
                        ? 'opacity-100 text-accent'
                        : 'opacity-0 group-hover:opacity-60 text-content-muted hover:opacity-100'
                    }`}
                  >
                    {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  </button>

                  {/* Icon or Thumbnail */}
                  <div className="w-14 h-14 my-1 flex items-center justify-center relative self-center mx-auto rounded overflow-hidden">
                    {item.mediaType === 'image' ? (
                      <img
                        src={api.getStreamUrl(item.path, storageId)}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-contain"
                      />
                    ) : item.mediaType === 'video' ? (
                      <VideoThumbnail
                        relPath={item.path}
                        storageId={storageId}
                        ext={item.ext}
                        alt={item.name}
                        className="w-full h-full object-contain"
                        showPlayBadge={false}
                      />
                    ) : (
                      getFileIcon(item, 'w-10 h-10')
                    )}
                  </div>

                  {/* File Name */}
                  <span 
                    className="text-xs font-normal text-center truncate w-full px-0.5 mt-1"
                    title={item.name}
                  >
                    {truncateMiddle(item.name, 20)}
                  </span>

                  {/* File Metadata */}
                  <span className="text-[10px] text-content-muted font-mono mt-0.5 truncate">
                    {item.isDir ? '폴더' : formatBytes(item.size)}
                  </span>

                  {/* Hover Menu Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onItemContextMenu(e, item);
                    }}
                    className="absolute top-2 right-2 p-1 rounded text-content-muted hover:text-content-primary opacity-0 group-hover:opacity-100 transition z-10"
                    title="추가 작업"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="border border-surface-border rounded-lg overflow-hidden bg-surface-card/30">
            <div className="flex items-center px-4 py-2 border-b border-surface-border text-xs text-content-muted select-none bg-surface-base">
              <div className="flex-1 min-w-0 flex items-center gap-3 pr-2">
                <button
                  onClick={onSelectAll}
                  className="text-content-muted hover:text-content-primary shrink-0"
                >
                  {isAllSelected ? <CheckSquare className="w-3.5 h-3.5 text-accent" /> : <Square className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => onSortChange('name')}
                  className="flex items-center gap-1 hover:text-content-primary transition"
                >
                  <span>이름</span>
                  {renderSortArrow('name')}
                </button>
              </div>

              <div className="hidden sm:block w-24 shrink-0 text-right pr-4">
                <button
                  onClick={() => onSortChange('size')}
                  className="inline-flex items-center gap-1 hover:text-content-primary transition"
                >
                  <span>크기</span>
                  {renderSortArrow('size')}
                </button>
              </div>

              <div className="hidden lg:block w-36 shrink-0 text-right pr-4">
                <button
                  onClick={() => onSortChange('date')}
                  className="inline-flex items-center gap-1 hover:text-content-primary transition"
                >
                  <span>수정 날짜</span>
                  {renderSortArrow('date')}
                </button>
              </div>

              <div className="w-28 shrink-0 text-right">
                작업
              </div>
            </div>

            <div className="divide-y divide-surface-borderSubtle">
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
                    className={`flex items-center px-4 py-2 text-xs cursor-pointer transition select-none ${
                      isSelected
                        ? 'bg-accent-subtle text-content-primary'
                        : 'hover:bg-surface-cardHover text-content-secondary hover:text-content-primary'
                    } ${isCut ? 'opacity-40' : ''}`}
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-3 pr-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelect(item.path);
                        }}
                        className="text-content-muted hover:text-content-primary shrink-0"
                      >
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-accent" /> : <Square className="w-3.5 h-3.5" />}
                      </button>
                      <span className="shrink-0 flex items-center justify-center w-5 h-5">
                        {getFileIcon(item, 'w-4 h-4')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="truncate block font-normal" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                    </div>

                    <div className="hidden sm:block w-24 shrink-0 text-right text-content-muted font-mono pr-4 text-[11px]">
                      {item.isDir ? '—' : formatBytes(item.size)}
                    </div>

                    <div className="hidden lg:block w-36 shrink-0 text-right text-content-muted pr-4 text-[11px]">
                      {formatDate(item.modTime)}
                    </div>

                    <div className="w-28 shrink-0 flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowDetails(item);
                        }}
                        className="p-1 text-content-muted hover:text-content-primary rounded transition"
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
                          className="p-1 text-content-muted hover:text-content-primary rounded transition"
                          title="웹페이지로 열기"
                        >
                          <Globe className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!item.isDir && (
                        <button
                          onClick={(e) => handleDownloadSingle(item, e)}
                          className="p-1 text-content-muted hover:text-content-primary rounded transition"
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
                        className="p-1 text-content-muted hover:text-content-primary rounded transition"
                        title="이름 변경"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSingle(item);
                        }}
                        className="p-1 text-content-muted hover:text-red-400 rounded transition"
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
