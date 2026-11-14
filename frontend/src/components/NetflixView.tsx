import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Play, 
  Info, 
  Download, 
  ChevronRight, 
  Folder, 
  Film, 
  Layers, 
  ArrowLeft, 
  Clock, 
  HardDrive, 
  Subtitles, 
  Sparkles,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  Scissors,
  FileText
} from 'lucide-react';
import { FileItem, BreadcrumbItem } from '../types';
import { formatBytes, formatDate, truncateMiddle } from '../utils/format';
import { api } from '../api';

interface NetflixViewProps {
  items: FileItem[];
  currentPath: string;
  storageId: string;
  storageName: string;
  onNavigate: (path: string) => void;
  onOpenMedia: (item: FileItem) => void;
  onExitNetflixView: () => void;
  onShowDetails: (item: FileItem) => void;
  onRename: (item: FileItem) => void;
  onDeleteSingle: (item: FileItem) => void;
  onCopySingle: (item: FileItem) => void;
  onCutSingle: (item: FileItem) => void;
  onContextMenu: (e: React.MouseEvent, item: FileItem) => void;
}

// Helper to parse nice display title and episode info
function parseVideoTitle(filename: string): { title: string; episode?: string; rawTag?: string } {
  const ext = filename.lastIndexOf('.') !== -1 ? filename.slice(filename.lastIndexOf('.')) : '';
  let cleanName = filename.slice(0, filename.length - ext.length);

  // Common episode pattern (e.g. E01, EP02, - 03, [04])
  const epMatch = cleanName.match(/(?:[sS]\d+)?(?:[eE]|ep|EP|회|화)\s*([0-9]{1,3})|(?:[\s\-_]+)([0-9]{2,3})(?:[\s\-_]|$)/);
  let episode: string | undefined;
  if (epMatch) {
    episode = epMatch[1] ? `EP ${epMatch[1]}` : `EP ${epMatch[2]}`;
  }

  // Clean title for display
  let title = cleanName
    .replace(/^\[[^\]]+\]\s*/g, '') // remove leading [Group]
    .replace(/\s*\[[^\]]+\]/g, '')   // remove trailing tags
    .replace(/\s*\([^\)]+\)/g, '')   // remove parentheses
    .replace(/1080p|720p|2160p|4k|x264|x265|hevc|aac|eac3|web-dl|bluray/gi, '')
    .trim();

  if (!title) title = cleanName;

  return { title, episode, rawTag: ext.toUpperCase().replace('.', '') };
}

// Subcomponent: Video Preview Card with dynamic thumbnail capture
const VideoCard: React.FC<{
  item: FileItem;
  storageId: string;
  isFeatured?: boolean;
  onPlay: () => void;
  onDetails: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCut: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}> = ({
  item,
  storageId,
  isFeatured,
  onPlay,
  onDetails,
  onDownload,
  onRename,
  onDelete,
  onCopy,
  onCut,
  onContextMenu,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamUrl = api.getStreamUrl(item.path, storageId);
  const { title, episode, rawTag } = useMemo(() => parseVideoTitle(item.name), [item.name]);

  // When hovered, preview video can play briefly or seek to 5s
  useEffect(() => {
    if (isHovered && videoRef.current) {
      videoRef.current.currentTime = 5;
    }
  }, [isHovered]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setMenuOpen(false); }}
      onContextMenu={onContextMenu}
      className={`group relative flex flex-col bg-[#181818] rounded-xl overflow-hidden shadow-lg border border-neutral-800 transition-all duration-300 ease-out hover:scale-105 hover:z-30 hover:border-red-600/60 hover:shadow-2xl hover:shadow-red-950/40 cursor-pointer ${
        isFeatured ? 'ring-2 ring-red-600' : ''
      }`}
      onClick={onPlay}
    >
      {/* 16:9 Thumbnail Area */}
      <div className="relative aspect-video w-full bg-neutral-900 overflow-hidden">
        {/* Hidden/preloaded HTML5 video for frame preview */}
        <video
          ref={videoRef}
          src={`${streamUrl}#t=2`}
          preload="metadata"
          muted
          playsInline
          className="w-full h-full object-cover transition-opacity duration-300 group-hover:brightness-110"
        />

        {/* Cinematic Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-black/30 pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none">
          {rawTag && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-black/70 backdrop-blur-md text-red-500 border border-red-500/30">
              {rawTag}
            </span>
          )}
          {episode && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white shadow-md">
              {episode}
            </span>
          )}
        </div>

        <div className="absolute top-2.5 right-2.5 pointer-events-none">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/60 backdrop-blur text-neutral-300">
            {formatBytes(item.size)}
          </span>
        </div>

        {/* Hover Center Play Button */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/95 text-black flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform">
            <Play className="w-6 h-6 fill-black ml-0.5" />
          </div>
        </div>
      </div>

      {/* Info Card Content */}
      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2">
        <div>
          <h3 
            className="text-sm font-bold text-white group-hover:text-red-400 transition-colors line-clamp-1"
            title={item.name}
          >
            {title}
          </h3>
          <p className="text-[11px] text-neutral-400 font-mono mt-0.5 line-clamp-1" title={item.name}>
            {truncateMiddle(item.name, 45)}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-1 border-t border-neutral-800/80 text-xs">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onPlay(); }}
              className="p-1.5 rounded-full hover:bg-neutral-800 text-white hover:text-red-400 transition"
              title="지금 재생"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDownload(); }}
              className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
              title="다운로드"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDetails(); }}
              className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
              title="상세 정보"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* More Action Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
              title="더보기"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <div 
                className="absolute right-0 bottom-full mb-1 w-36 bg-[#202028] border border-neutral-700 rounded-lg shadow-xl py-1 z-40 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => { setMenuOpen(false); onRename(); }}
                  className="w-full px-3 py-1.5 text-left text-neutral-200 hover:bg-neutral-700 flex items-center gap-2"
                >
                  <Edit3 className="w-3.5 h-3.5" /> 이름 변경
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onCopy(); }}
                  className="w-full px-3 py-1.5 text-left text-neutral-200 hover:bg-neutral-700 flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" /> 복사
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onCut(); }}
                  className="w-full px-3 py-1.5 text-left text-neutral-200 hover:bg-neutral-700 flex items-center gap-2"
                >
                  <Scissors className="w-3.5 h-3.5" /> 잘라내기
                </button>
                <div className="h-px bg-neutral-700 my-1" />
                <button
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                  className="w-full px-3 py-1.5 text-left text-red-400 hover:bg-red-500/20 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const NetflixView: React.FC<NetflixViewProps> = ({
  items,
  currentPath,
  storageId,
  storageName,
  onNavigate,
  onOpenMedia,
  onExitNetflixView,
  onShowDetails,
  onRename,
  onDeleteSingle,
  onCopySingle,
  onCutSingle,
  onContextMenu,
}) => {
  // Split items into videos, folders, and other files
  const { videoItems, folderItems, otherFiles } = useMemo(() => {
    const videos: FileItem[] = [];
    const folders: FileItem[] = [];
    const others: FileItem[] = [];

    items.forEach((item) => {
      if (item.isDir) {
        folders.push(item);
      } else if (item.mediaType === 'video') {
        videos.push(item);
      } else {
        others.push(item);
      }
    });

    return { videoItems: videos, folderItems: folders, otherFiles: others };
  }, [items]);

  // Featured video is the first video or selected
  const [featuredItem, setFeaturedItem] = useState<FileItem | null>(null);

  useEffect(() => {
    if (videoItems.length > 0) {
      if (!featuredItem || !videoItems.some(v => v.path === featuredItem.path)) {
        setFeaturedItem(videoItems[0]);
      }
    } else {
      setFeaturedItem(null);
    }
  }, [videoItems]);

  // Breadcrumbs
  const pathParts = currentPath.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [
    { name: storageName || '저장소', path: '/' },
    ...pathParts.map((part, index) => ({
      name: part,
      path: '/' + pathParts.slice(0, index + 1).join('/'),
    })),
  ];

  const featuredParsed = useMemo(() => {
    if (!featuredItem) return null;
    return parseVideoTitle(featuredItem.name);
  }, [featuredItem]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#141414] overflow-y-auto overflow-x-hidden text-neutral-100 select-none scrollbar-thin scrollbar-thumb-neutral-800">
      {/* Top Netflix Navigation Bar */}
      <div className="sticky top-0 z-40 bg-[#141414]/90 backdrop-blur-md border-b border-neutral-800/80 px-8 py-3.5 flex items-center justify-between transition-all">
        {/* Left: Netflix Branding & Breadcrumbs */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tighter text-red-600 drop-shadow-md">
              MININAS
            </span>
            <span className="px-1.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-red-600/20 text-red-400 border border-red-600/30">
              FLIX
            </span>
          </div>

          <div className="h-4 w-px bg-neutral-800" />

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 text-xs">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.path}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />}
                <button
                  onClick={() => onNavigate(crumb.path)}
                  className={`px-1.5 py-0.5 rounded transition ${
                    idx === breadcrumbs.length - 1
                      ? 'font-bold text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>

        {/* Right: Exit to Standard Explorer Button */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400 font-mono hidden md:inline">
            총 {videoItems.length}편의 동영상
          </span>
          <button
            onClick={onExitNetflixView}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            일반 탐색기 뷰
          </button>
        </div>
      </div>

      {/* Featured Hero Billboard */}
      {featuredItem && featuredParsed ? (
        <div className="relative w-full min-h-[380px] lg:min-h-[460px] bg-gradient-to-r from-black via-neutral-950 to-neutral-900 flex items-center px-8 lg:px-14 overflow-hidden border-b border-neutral-800">
          {/* Background Video Preview Frame / Backdrop */}
          <div className="absolute right-0 top-0 w-2/3 h-full overflow-hidden opacity-30 lg:opacity-40 pointer-events-none">
            <video
              src={`${api.getStreamUrl(featuredItem.path, storageId)}#t=10`}
              preload="metadata"
              muted
              playsInline
              className="w-full h-full object-cover filter blur-[2px] scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
          </div>

          {/* Hero Content */}
          <div className="relative z-10 max-w-2xl py-8 space-y-4">
            {/* Tagline / Badges */}
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-black uppercase tracking-wider bg-red-600 text-white shadow-lg shadow-red-900/50">
                <Sparkles className="w-3 h-3" /> FEATURED
              </span>
              {featuredParsed.rawTag && (
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
                  {featuredParsed.rawTag}
                </span>
              )}
              {featuredParsed.episode && (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-600/30 text-blue-400 border border-blue-500/30">
                  {featuredParsed.episode}
                </span>
              )}
              <span className="text-xs text-neutral-400 font-mono flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-neutral-500" />
                {formatBytes(featuredItem.size)}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight drop-shadow-md">
              {featuredParsed.title}
            </h1>

            {/* Subtitle / Filename */}
            <p className="text-xs lg:text-sm text-neutral-400 font-mono line-clamp-2 max-w-xl">
              {featuredItem.name}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={() => onOpenMedia(featuredItem)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold bg-white text-black hover:bg-neutral-200 shadow-xl transition transform active:scale-95"
              >
                <Play className="w-4 h-4 fill-black" />
                지금 재생
              </button>

              <button
                onClick={() => onShowDetails(featuredItem)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-neutral-700/80 hover:bg-neutral-600 text-white backdrop-blur-md transition"
              >
                <Info className="w-4 h-4" />
                상세 정보
              </button>

              <a
                href={api.getDownloadUrl(featuredItem.path, storageId)}
                download
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition"
              >
                <Download className="w-4 h-4" />
                다운로드
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {/* Main Content Area */}
      <div className="px-8 lg:px-14 py-8 space-y-10">
        {/* Section 1: Subfolders / Seasons (if any) */}
        {folderItems.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-bold text-white">시리즈 & 하위 폴더</h2>
              <span className="text-xs text-neutral-500 font-mono">({folderItems.length})</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {folderItems.map((folder) => (
                <div
                  key={folder.path}
                  onClick={() => onNavigate(folder.path)}
                  onContextMenu={(e) => onContextMenu(e, folder)}
                  className="group flex items-center gap-3 p-3.5 bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 hover:border-red-600/50 rounded-xl cursor-pointer transition-all duration-200 hover:shadow-lg"
                >
                  <div className="w-10 h-10 rounded-lg bg-red-600/10 border border-red-600/20 flex items-center justify-center shrink-0 group-hover:bg-red-600/20">
                    <Folder className="w-5 h-5 text-red-500 fill-red-500/20" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold text-white truncate group-hover:text-red-400 transition-colors">
                      {folder.name}
                    </h4>
                    <span className="text-[10px] text-neutral-500">폴더 열기</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 2: Video Library (Netflix Grid) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-bold text-white">동영상 목록</h2>
              <span className="text-xs text-neutral-500 font-mono">({videoItems.length}편)</span>
            </div>
          </div>

          {videoItems.length === 0 ? (
            <div className="py-16 text-center text-neutral-500">
              <Film className="w-12 h-12 mx-auto mb-2 opacity-30 text-red-500" />
              <p className="text-sm">이 폴더에 동영상 파일이 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {videoItems.map((item) => (
                <VideoCard
                  key={item.path}
                  item={item}
                  storageId={storageId}
                  isFeatured={featuredItem?.path === item.path}
                  onPlay={() => {
                    setFeaturedItem(item);
                    onOpenMedia(item);
                  }}
                  onDetails={() => {
                    setFeaturedItem(item);
                    onShowDetails(item);
                  }}
                  onDownload={() => {
                    window.location.href = api.getDownloadUrl(item.path, storageId);
                  }}
                  onRename={() => onRename(item)}
                  onDelete={() => onDeleteSingle(item)}
                  onCopy={() => onCopySingle(item)}
                  onCut={() => onCutSingle(item)}
                  onContextMenu={(e) => onContextMenu(e, item)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Section 3: Subtitles & Other Files (if any) */}
        {otherFiles.length > 0 && (
          <section className="pt-4 border-t border-neutral-800/80 space-y-3">
            <div className="flex items-center gap-2 text-neutral-400">
              <Subtitles className="w-4 h-4 text-neutral-500" />
              <h3 className="text-sm font-semibold">자막 및 기타 파일 ({otherFiles.length})</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
              {otherFiles.map((file) => (
                <div
                  key={file.path}
                  onContextMenu={(e) => onContextMenu(e, file)}
                  onClick={() => onOpenMedia(file)}
                  className="flex items-center justify-between p-2.5 bg-neutral-900/60 hover:bg-neutral-800/80 border border-neutral-800/80 rounded-lg text-neutral-300 cursor-pointer transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-neutral-500 shrink-0" />
                    <span className="truncate" title={file.name}>
                      {truncateMiddle(file.name, 35)}
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono shrink-0 ml-2">
                    {formatBytes(file.size)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
