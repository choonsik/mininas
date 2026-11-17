import React, { useState, useEffect, useMemo } from 'react';
import { 
  Film, 
  Play, 
  Search, 
  RefreshCw, 
  Subtitles, 
  HardDrive, 
  Layers, 
  X, 
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

function parseMovieMeta(filename: string): { displayTitle: string; episode?: string; qualityTag?: string; year?: string; seriesTag?: string } {
  const ext = filename.lastIndexOf('.') !== -1 ? filename.slice(filename.lastIndexOf('.')) : '';
  let clean = filename.slice(0, filename.length - ext.length);

  const yearMatch = clean.match(/(?:[\s\._\-\(\[]|^)(19\d{2}|20\d{2})(?:[\s\._\-\)\]]|$)/);
  const year = yearMatch ? yearMatch[1] : undefined;

  const seriesMatch = clean.match(/(?:[\s\._\-\(\[]|^)([0-9]{1,3})\s*부작(?:[\s\._\-\)\]]|$)/);
  const seriesTag = seriesMatch ? `${seriesMatch[1]}부작` : undefined;

  const epMatch = clean.match(/(?:[sS]\d+)?(?:[eE]|ep|EP|회|화)\s*([0-9]{1,3})|(?:^|[\s\-_]+)([0-9]{1,3})(?:[\s\-_]|$)/);
  let episode: string | undefined;
  if (epMatch) {
    const num = epMatch[1] || epMatch[2];
    if (num) {
      episode = `EP ${parseInt(num, 10)}`;
    }
  }

  let qualityTag: string | undefined;
  if (/2160p|4k/i.test(clean)) qualityTag = '4K';
  else if (/1080p/i.test(clean)) qualityTag = '1080p';
  else if (/720p/i.test(clean)) qualityTag = '720p';

  let displayTitle = clean
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^\)]*\)/g, ' ')
    .replace(/(?:_|\.)(?:web|dl|rip|h264|h265|aac)\b/gi, ' ')
    .replace(/(?:[\s\._\-\(\[]|^)(19\d{2}|20\d{2})(?:[\s\._\-\)\]]|$)/g, ' ')
    .replace(/(?:[\s\._\-\(\[]|^)[0-9]{1,3}\s*부작(?:[\s\._\-\)\]]|$)/g, ' ')
    .replace(/(?:[sS]\d+)?(?:[eE]|ep|EP|회|화)\s*[0-9]{1,3}/gi, ' ')
    .replace(/(?:^|[\s\-_]+)[0-9]{1,3}(?:[\s\-_]+|$)/g, ' ')
    .replace(/1080p|720p|2160p|4k|x264|x265|hevc|aac|eac3|web-dl|bluray|dvdrip|hdr/gi, ' ')
    .replace(/[\._\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!displayTitle) displayTitle = clean;

  return { displayTitle, episode, qualityTag, year, seriesTag };
}

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

    const handleLoadedMetadata = () => {
      video.currentTime = Math.min(10, video.duration / 3);
    };

    const handleSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          if (isMounted) setThumbUrl(dataUrl);
        }
      } catch (e) {
        // Fallback
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
      className="group bg-surface-card border border-surface-border hover:border-accent/40 rounded-lg overflow-hidden cursor-pointer flex flex-col justify-between transition select-none"
    >
      <div>
        {/* 16:9 Thumbnail Poster Frame */}
        <div className="relative aspect-video w-full bg-surface-base overflow-hidden flex items-center justify-center">
          {thumbUrl ? (
            <img 
              src={thumbUrl} 
              alt={group.title} 
              className="w-full h-full object-contain" 
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-content-muted gap-1">
              <Film className="w-8 h-8 opacity-40" />
              <span className="text-[10px] font-mono">{movie.ext.toUpperCase()}</span>
            </div>
          )}

          {/* Badges */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 flex-wrap max-w-[85%]">
            {group.isSeries ? (
              <span className="px-2 py-0.5 rounded bg-indigo-600/90 text-white text-[10px] font-bold border border-indigo-400/40 flex items-center gap-1 shadow backdrop-blur-md">
                <Layers className="w-3 h-3 text-indigo-200" />
                <span>{group.items.length > 1 ? `${group.items.length}부작` : (meta.seriesTag || '시리즈')}</span>
              </span>
            ) : meta.seriesTag ? (
              <span className="px-2 py-0.5 rounded bg-indigo-600/90 text-white text-[10px] font-bold border border-indigo-400/40 flex items-center gap-1 shadow backdrop-blur-md">
                <Layers className="w-3 h-3 text-indigo-200" />
                <span>{meta.seriesTag}</span>
              </span>
            ) : meta.episode ? (
              <span className="px-1.5 py-0.5 rounded bg-black/75 text-cyan-300 text-[10px] font-bold font-mono border border-cyan-500/20 backdrop-blur-md shadow">
                {meta.episode}
              </span>
            ) : null}

            {meta.qualityTag && (
              <span className="px-1.5 py-0.5 rounded bg-black/70 text-gray-300 text-[9px] font-mono border border-white/10 backdrop-blur-md">
                {meta.qualityTag}
              </span>
            )}
          </div>

          <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
            {group.hasSubtitle && (
              <span className="px-1.5 py-0.5 rounded bg-surface-card/90 text-content-secondary text-[10px] font-medium border border-surface-border flex items-center gap-0.5">
                <Subtitles className="w-2.5 h-2.5" />
                <span>CC</span>
              </span>
            )}
          </div>

          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-surface-card border border-surface-border text-content-primary flex items-center justify-center shadow">
              {group.isSeries ? (
                <Layers className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] text-content-muted font-mono flex items-center gap-1 truncate max-w-[140px]">
              <HardDrive className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{group.storageName}</span>
            </span>

            {meta.year && (
              <span className="text-[10px] font-mono text-content-muted">
                {meta.year}
              </span>
            )}
          </div>

          <h4 
            className="text-xs font-semibold text-content-primary group-hover:text-accent transition truncate"
            title={group.title}
          >
            {group.title}
          </h4>

          <div className="flex items-center justify-between text-[10px] text-content-muted mt-1.5 font-mono">
            <span>
              {group.isSeries ? `${group.items.length}개 파일` : formatBytes(group.totalSize)}
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

  const groups = useMemo<CinemaGroup[]>(() => {
    const map = new Map<string, CinemaItem[]>();

    for (const item of movies) {
      const lastSlash = item.relPath.lastIndexOf('/');
      const parentDir = lastSlash > 0 ? item.relPath.substring(0, lastSlash) : '/';
      const meta = parseMovieMeta(item.name);
      
      const normalizedTitle = meta.displayTitle.toLowerCase().trim();
      const hasSeriesTrait = Boolean(meta.episode || meta.seriesTag);

      const groupKey = hasSeriesTrait
        ? `${item.storageId}:${parentDir}:${normalizedTitle}`
        : (parentDir === '/' 
            ? `${item.storageId}:root:${item.name}` 
            : `${item.storageId}:${parentDir}:${normalizedTitle}`);

      if (!map.has(groupKey)) {
        map.set(groupKey, []);
      }
      map.get(groupKey)!.push(item);
    }

    const result: CinemaGroup[] = [];

    map.forEach((items, key) => {
      items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      const rep = items[0];
      const repMeta = parseMovieMeta(rep.name);
      const lastSlash = rep.relPath.lastIndexOf('/');
      const parentDir = lastSlash > 0 ? rep.relPath.substring(0, lastSlash) : '/';
      
      let groupTitle = '';
      if (items.length > 1) {
        groupTitle = repMeta.displayTitle;
      } else if (parentDir !== '/') {
        groupTitle = repMeta.displayTitle || parentDir.substring(parentDir.lastIndexOf('/') + 1);
      } else {
        groupTitle = repMeta.displayTitle;
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
        isSeries: items.length > 1 || Boolean(repMeta.seriesTag),
        totalSize,
        latestModTime: latestTime,
        hasSubtitle: hasSub,
        representativeItem: rep,
      });
    });

    result.sort((a, b) => new Date(b.latestModTime).getTime() - new Date(a.latestModTime).getTime());
    return result;
  }, [movies]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter(g => 
      g.title.toLowerCase().includes(q) || 
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
      setActiveSeriesGroup(group);
    } else {
      handlePlaySingleItem(group.items[0], group.items);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-content-primary">
      {/* Header & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-3 border-b border-surface-border">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
          <button
            onClick={() => setSelectedStorage('all')}
            className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
              selectedStorage === 'all'
                ? 'bg-surface-card border border-surface-border font-medium text-content-primary'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            전체 ({groups.length})
          </button>
          {storages.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedStorage(s.id)}
              className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
                selectedStorage === s.id
                  ? 'bg-surface-card border border-surface-border font-medium text-content-primary'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="작품 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-card border border-surface-border rounded-md pl-8 pr-3 py-1 text-xs text-content-primary placeholder-content-muted focus:outline-none focus:border-accent transition"
            />
          </div>

          <button
            onClick={fetchMovies}
            disabled={isLoading}
            className="p-1.5 bg-surface-card hover:bg-surface-cardHover border border-surface-border rounded-md text-content-muted hover:text-content-primary transition disabled:opacity-40"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Movies Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-2 text-content-muted">
          <RefreshCw className="w-5 h-5 text-accent animate-spin" />
          <p className="text-xs">영화 및 비디오 불러오는 중...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-2 text-center text-content-muted">
          <Film className="w-8 h-8 opacity-40 mb-1" />
          <h4 className="text-xs font-medium text-content-secondary">
            {searchQuery ? '검색된 작품이 없습니다' : '보관된 비디오가 없습니다'}
          </h4>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredGroups.map(group => (
            <CinemaPosterCard
              key={group.id}
              group={group}
              onClick={() => handleCardClick(group)}
            />
          ))}
        </div>
      )}

      {/* Series Episode Selector Modal */}
      {activeSeriesGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg bg-surface-card border border-surface-border rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh] text-content-primary">
            <div className="p-4 border-b border-surface-border bg-surface-header flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-indigo-600/90 text-white text-[10px] font-bold shadow flex items-center gap-1">
                    <Layers className="w-3 h-3 text-indigo-200" />
                    <span>{activeSeriesGroup.items.length}부작</span>
                  </span>
                  <span className="text-[11px] text-content-muted font-mono">
                    {activeSeriesGroup.storageName}
                  </span>
                </div>
                <h3 className="text-sm font-semibold">
                  {activeSeriesGroup.title}
                </h3>
              </div>

              <button
                onClick={() => setActiveSeriesGroup(null)}
                className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface-cardHover transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
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
                    className="flex items-center justify-between p-2.5 rounded bg-surface-base hover:bg-surface-cardHover border border-surface-borderSubtle cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Play className="w-3.5 h-3.5 text-accent shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-accent">
                            {epLabel}
                          </span>
                          <span className="text-xs truncate">
                            {meta.displayTitle || item.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-content-muted font-mono shrink-0 ml-2">
                      <span>{formatBytes(item.size)}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-surface-border bg-surface-header flex items-center justify-end">
              <button
                onClick={() => setActiveSeriesGroup(null)}
                className="px-3 py-1 rounded text-xs text-content-secondary hover:text-content-primary transition"
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
