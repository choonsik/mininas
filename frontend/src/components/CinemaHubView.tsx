import React, { useState, useEffect, useMemo } from 'react';
import { 
  Film, 
  Play, 
  Sparkles, 
  FolderOpen, 
  Search, 
  RefreshCw, 
  Clapperboard, 
  Subtitles, 
  HardDrive, 
  Calendar,
  Layers,
  X,
  Tv,
  ChevronRight
} from 'lucide-react';
import { StorageInfo, CinemaItem, FileItem } from '../types';
import { api } from '../api';
import { formatBytes } from '../utils/format';

interface CinemaHubViewProps {
  storages: StorageInfo[];
  onPlayMovie: (item: FileItem, storageId: string, allItems: FileItem[]) => void;
  onNavigateToStorage: (storageId: string, path: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// Group of movies/episodes in the same folder or title
interface CinemaGroup {
  id: string;
  title: string;
  storageId: string;
  storageName: string;
  folderPath: string;
  items: CinemaItem[];
  isSeries: boolean;
  totalSize: number;
  latestModTime: string;
  hasSubtitle: boolean;
  representativeItem: CinemaItem;
}

// Helper to parse clean title and episode info from movie filenames
function parseMovieMeta(filename: string): { displayTitle: string; episode?: string; qualityTag?: string; year?: string } {
  const ext = filename.lastIndexOf('.') !== -1 ? filename.slice(filename.lastIndexOf('.')) : '';
  let clean = filename.slice(0, filename.length - ext.length);

  // Extract year if present (e.g. (2019) or .2019.)
  const yearMatch = clean.match(/(?:[\s\._\-\(\[]|^)(19\d{2}|20\d{2})(?:[\s\._\-\)\]]|$)/);
  const year = yearMatch ? yearMatch[1] : undefined;

  // Extract episode pattern (e.g. E01, EP02, - 03, [04], 1화, 2회)
  const epMatch = clean.match(/(?:[sS]\d+)?(?:[eE]|ep|EP|회|화)\s*([0-9]{1,3})|(?:[\s\-_]+)([0-9]{2,3})(?:[\s\-_]|$)/);
  let episode: string | undefined;
  if (epMatch) {
    episode = epMatch[1] ? `EP ${epMatch[1]}` : `EP ${epMatch[2]}`;
  }

  // Quality tag detection
  let qualityTag: string | undefined;
  if (/2160p|4k/i.test(clean)) qualityTag = '4K UHD';
  else if (/1080p/i.test(clean)) qualityTag = '1080p FHD';
  else if (/720p/i.test(clean)) qualityTag = '720p HD';

  // Clean title for display
  let displayTitle = clean
    .replace(/^\[[^\]]+\]\s*/g, '') // remove leading [Group]
    .replace(/\s*\[[^\]]+\]/g, '')   // remove trailing tags
    .replace(/\s*\([^\)]+\)/g, '')   // remove parentheses
    .replace(/(?:[\s\._\-\(\[]|^)(19\d{2}|20\d{2})(?:[\s\._\-\)\]]|$)/g, ' ')
    .replace(/1080p|720p|2160p|4k|x264|x265|hevc|aac|eac3|web-dl|bluray|dvdrip|hdr/gi, '')
    .replace(/[\._\-]+/g, ' ')
    .trim();

  if (!displayTitle) displayTitle = clean;

  return { displayTitle, episode, qualityTag, year };
}

// 16:9 Video Thumbnail Component (captures first frame client-side, zero server load)
const CinemaPosterCard: React.FC<{
  group: CinemaGroup;
  onClick: () => void;
}> = ({ group, onClick }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const movie = group.representativeItem;
  const meta = useMemo(() => parseMovieMeta(movie.name), [movie.name]);

  useEffect(() => {
    const ext = movie.ext.toLowerCase();
    if (ext !== '.mp4' && ext !== '.webm' && ext !== '.mov') {
      return;
    }

    let isMounted = true;
    const video = document.createElement('video');
    video.src = api.getStreamUrl(movie.relPath, movie.storageId);
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    const handleLoadedMetadata = () => {
      video.currentTime = Math.min(2.5, Math.max(0.5, (video.duration || 10) * 0.05));
    };

    const handleSeeked = () => {
      if (!isMounted) return;
      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const canvas = document.createElement('canvas');

        // Preserve 100% accurate original aspect ratio (width-based or height-based)
        const maxDimension = 480;
        if (vw >= vh) {
          canvas.width = maxDimension;
          canvas.height = Math.max(1, Math.round(maxDimension * (vh / vw)));
        } else {
          canvas.height = maxDimension;
          canvas.width = Math.max(1, Math.round(maxDimension * (vw / vh)));
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setThumbUrl(dataUrl);
        }
      } catch (e) {
        // Fallback silently
      } finally {
        video.src = '';
        video.remove();
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);

    return () => {
      isMounted = false;
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.src = '';
      video.remove();
    };
  }, [movie.relPath, movie.storageId, movie.ext]);

  return (
    <div 
      onClick={onClick}
      className="group relative bg-[#161622] border border-[#252535] hover:border-red-500/60 rounded-2xl overflow-hidden cursor-pointer flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover:shadow-red-950/30 hover:-translate-y-1 select-none"
    >
      <div>
        {/* 16:9 Thumbnail Poster Frame */}
        <div className="relative aspect-video w-full bg-[#0d0d14] overflow-hidden flex items-center justify-center group/poster">
          {thumbUrl ? (
            <img 
              src={thumbUrl} 
              alt={group.title} 
              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" 
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-600 gap-2">
              <Film className="w-10 h-10 text-red-500/40 group-hover:text-red-400 transition" />
              <span className="text-[10px] font-mono text-gray-500">{movie.ext.toUpperCase()}</span>
            </div>
          )}

          {/* Top Badges */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
            {group.isSeries ? (
              <span className="px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 text-white text-[11px] font-bold tracking-tight shadow-md flex items-center gap-1">
                <Layers className="w-3 h-3" />
                <span>{group.items.length}부작 시리즈</span>
              </span>
            ) : meta.episode ? (
              <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-bold tracking-tight shadow">
                {meta.episode}
              </span>
            ) : null}

            {meta.qualityTag && (
              <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-amber-300 border border-amber-500/30 text-[10px] font-mono font-semibold">
                {meta.qualityTag}
              </span>
            )}
          </div>

          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
            {group.hasSubtitle && (
              <span className="px-1.5 py-0.5 rounded-md bg-blue-600/80 backdrop-blur-md text-white text-[10px] font-bold flex items-center gap-1 shadow">
                <Subtitles className="w-3 h-3" />
                <span>CC</span>
              </span>
            )}
          </div>

          {/* Hover Play/Browse Overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
            <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-2xl shadow-red-950 transform scale-90 group-hover:scale-100 transition-transform">
              {group.isSeries ? (
                <Layers className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </div>
          </div>
        </div>

        {/* Info Section (Clean & Minimal) */}
        <div className="p-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-semibold text-red-400 bg-red-950/40 border border-red-800/30 px-2 py-0.5 rounded-full flex items-center gap-1 max-w-[140px] truncate">
              <HardDrive className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{group.storageName}</span>
            </span>

            {meta.year && (
              <span className="text-[10px] font-mono text-gray-400">
                {meta.year}
              </span>
            )}
          </div>

          <h4 
            className="text-sm font-bold text-white group-hover:text-red-400 transition line-clamp-1 leading-snug"
            title={group.title}
          >
            {group.title}
          </h4>

          <div className="flex items-center justify-between text-[11px] text-gray-400 mt-2 font-mono">
            <span>
              {group.isSeries ? `총 ${group.items.length}개 파일` : formatBytes(group.totalSize)}
            </span>
            <span>{new Date(group.latestModTime).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const CinemaHubView: React.FC<CinemaHubViewProps> = ({
  storages,
  onPlayMovie,
  onNavigateToStorage,
  onShowToast,
}) => {
  const [movies, setMovies] = useState<CinemaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStorage, setSelectedStorage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSeriesGroup, setActiveSeriesGroup] = useState<CinemaGroup | null>(null);

  const fetchMovies = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCinemaVideos(selectedStorage === 'all' ? undefined : selectedStorage);
      setMovies(data);
    } catch (err: any) {
      onShowToast(`영화 라이브러리 로드 실패: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMovies();
  }, [selectedStorage]);

  // Group movies by parent folder / series
  const groups = useMemo<CinemaGroup[]>(() => {
    const map = new Map<string, CinemaItem[]>();

    for (const item of movies) {
      const lastSlash = item.relPath.lastIndexOf('/');
      const parentDir = lastSlash > 0 ? item.relPath.substring(0, lastSlash) : '/';
      
      // If placed in storage root (/), treat as standalone individual movie
      const groupKey = parentDir === '/' 
        ? `${item.storageId}:root:${item.name}` 
        : `${item.storageId}:${parentDir}`;

      if (!map.has(groupKey)) {
        map.set(groupKey, []);
      }
      map.get(groupKey)!.push(item);
    }

    const result: CinemaGroup[] = [];

    map.forEach((items, key) => {
      // Natural sort episodes inside group (E01, E02...)
      items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      const rep = items[0];
      const lastSlash = rep.relPath.lastIndexOf('/');
      const parentDir = lastSlash > 0 ? rep.relPath.substring(0, lastSlash) : '/';
      
      // Determine group title: folder name for nested series, or clean movie title for root files
      let groupTitle = '';
      if (parentDir !== '/') {
        groupTitle = parentDir.substring(parentDir.lastIndexOf('/') + 1);
      } else {
        const meta = parseMovieMeta(rep.name);
        groupTitle = meta.displayTitle;
      }

      let totalSize = 0;
      let hasSub = false;
      let latestTime = items[0].modTime;

      items.forEach(it => {
        totalSize += it.size;
        if (it.hasSubtitle) hasSub = true;
        if (new Date(it.modTime) > new Date(latestTime)) {
          latestTime = it.modTime;
        }
      });

      result.push({
        id: key,
        title: groupTitle,
        storageId: rep.storageId,
        storageName: rep.storageName,
        folderPath: parentDir,
        items,
        isSeries: items.length > 1,
        totalSize,
        latestModTime: latestTime,
        hasSubtitle: hasSub,
        representativeItem: rep,
      });
    });

    // Sort groups: most recently updated groups first
    result.sort((a, b) => new Date(b.latestModTime).getTime() - new Date(a.latestModTime).getTime());
    return result;
  }, [movies]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter(g => 
      g.title.toLowerCase().includes(q) || 
      g.storageName.toLowerCase().includes(q) ||
      g.items.some(it => it.name.toLowerCase().includes(q))
    );
  }, [groups, searchQuery]);

  const handlePlaySingleItem = (item: CinemaItem, groupItems: CinemaItem[]) => {
    const fileItem: FileItem = {
      name: item.name,
      path: item.relPath,
      isDir: false,
      size: item.size,
      modTime: item.modTime,
      ext: item.ext,
      mediaType: 'video',
    };
    const playlist: FileItem[] = groupItems.map(it => ({
      name: it.name,
      path: it.relPath,
      isDir: false,
      size: it.size,
      modTime: it.modTime,
      ext: it.ext,
      mediaType: 'video',
    }));
    onPlayMovie(fileItem, item.storageId, playlist);
  };

  const handleCardClick = (group: CinemaGroup) => {
    if (group.isSeries) {
      // Open series episode drawer / modal
      setActiveSeriesGroup(group);
    } else {
      // Single movie: play immediately!
      handlePlaySingleItem(group.items[0], group.items);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
      {/* Filter Chips & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Storage Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedStorage('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              selectedStorage === 'all'
                ? 'bg-red-600 text-white shadow-md shadow-red-950/50'
                : 'bg-[#181824] text-gray-400 hover:text-white hover:bg-[#222232] border border-[#262638]'
            }`}
          >
            전체 작품 ({groups.length})
          </button>
          {storages.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedStorage(s.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedStorage === s.id
                  ? 'bg-red-600 text-white shadow-md shadow-red-950/50'
                  : 'bg-[#181824] text-gray-400 hover:text-white hover:bg-[#222232] border border-[#262638]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Search Input & Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="작품, 시리즈 제목 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#181822] border border-[#292938] rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/60 transition"
            />
          </div>

          <button
            onClick={fetchMovies}
            disabled={isLoading}
            className="p-2 bg-[#181824] hover:bg-[#222232] border border-[#262638] rounded-xl text-gray-400 hover:text-white transition disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Movies Grid Section */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-[#15151e] border border-[#232330] rounded-2xl">
          <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
          <p className="text-sm text-gray-300">저장소 전체의 영화 및 시리즈 정리 중...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-[#15151e] border border-[#232330] rounded-2xl text-center">
          <Film className="w-10 h-10 text-gray-600" />
          <h4 className="text-base font-bold text-gray-200">
            {searchQuery ? '검색된 작품이 없습니다.' : '보관된 영화나 시리즈가 없습니다.'}
          </h4>
          <p className="text-xs text-gray-400 max-w-md">
            저장소의 어떤 폴더에든 영화나 드라마 영상(.mp4, .mkv, .avi 등)을 넣어두시면 시리즈 단위로 묶여 넷플릭스 스타일로 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clapperboard className="w-4 h-4 text-red-400" />
              <span>영화 & 시리즈 보관함</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-red-600/15 text-red-400 border border-red-500/30">
                {filteredGroups.length}개 작품
              </span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {filteredGroups.map(group => (
              <CinemaPosterCard
                key={group.id}
                group={group}
                onClick={() => handleCardClick(group)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Netflix-style Episode Selector Modal */}
      {activeSeriesGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl bg-[#161622] border border-[#2b2b3d] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-[#252535] bg-gradient-to-r from-red-950/40 to-transparent flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-500/30 text-[11px] font-bold">
                    {activeSeriesGroup.storageName}
                  </span>
                  <span className="text-xs text-gray-400 font-mono">
                    총 {activeSeriesGroup.items.length}부작
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  {activeSeriesGroup.title}
                </h3>
              </div>

              <button
                onClick={() => setActiveSeriesGroup(null)}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#252538] transition shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Episode List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5">
              {activeSeriesGroup.items.map((item, idx) => {
                const meta = parseMovieMeta(item.name);
                const epLabel = meta.episode || `${idx + 1}화`;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      handlePlaySingleItem(item, activeSeriesGroup.items);
                      setActiveSeriesGroup(null);
                    }}
                    className="group flex items-center justify-between p-3.5 rounded-2xl bg-[#1c1c2a] hover:bg-red-600/10 border border-[#28283a] hover:border-red-500/40 cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#242436] group-hover:bg-red-600 text-gray-300 group-hover:text-white flex items-center justify-center shrink-0 transition shadow-inner">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-red-400 font-mono">
                            {epLabel}
                          </span>
                          {item.hasSubtitle && (
                            <span className="px-1.5 py-0.2 rounded bg-blue-600/30 text-blue-300 text-[10px] font-bold">
                              CC
                            </span>
                          )}
                          <span className="text-xs font-bold text-white group-hover:text-red-300 transition truncate">
                            {meta.displayTitle || item.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 font-mono truncate mt-0.5">
                          {item.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-400 font-mono shrink-0 ml-3">
                      <span>{formatBytes(item.size)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transition" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#252535] bg-[#12121a] flex items-center justify-between text-xs text-gray-400">
              <span>원하는 회차를 누르면 바로 재생되며 다음 회차로 자동 이어집니다.</span>
              <button
                onClick={() => setActiveSeriesGroup(null)}
                className="px-4 py-1.5 rounded-xl bg-[#1f1f2e] hover:bg-[#28283c] text-gray-300 hover:text-white transition shrink-0"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
