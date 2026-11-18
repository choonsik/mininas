import React, { useState, useEffect, useMemo } from 'react';
import { 
  Image as ImageIcon, 
  Film, 
  RefreshCw, 
  Calendar,
  Folder,
  ChevronLeft,
  Camera,
  Info
} from 'lucide-react';
import { StorageInfo, PhotoItem, FileItem } from '../types';
import { api } from '../api';
import { formatBytes } from '../utils/format';
import { VideoThumbnail } from './VideoThumbnail';
import { FileDetailsModal } from './FileDetailsModal';

interface PhotosHubViewProps {
  storages: StorageInfo[];
  onOpenPhoto: (item: FileItem, storageId: string, allItems: FileItem[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface TimelineMonthGroup {
  monthKey: string;
  displayTitle: string;
  items: PhotoItem[];
}

interface AlbumGroup {
  key: string;
  albumName: string;
  storageId: string;
  storageName: string;
  items: PhotoItem[];
  coverItem: PhotoItem;
  imageCount: number;
  videoCount: number;
  totalSize: number;
  latestTakenAt: string;
  dateRangeLabel: string;
}

function getEffectiveDate(item: PhotoItem): Date {
  const raw = item.takenAt || item.modTime;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  const fallback = new Date(item.modTime);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

function formatYearMonth(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildTimelineGroups(list: PhotoItem[]): TimelineMonthGroup[] {
  const map = new Map<string, PhotoItem[]>();

  for (const item of list) {
    const date = getEffectiveDate(item);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;

    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(item);
  }

  const groups: TimelineMonthGroup[] = [];
  map.forEach((items, key) => {
    const [y, m] = key.split('-');
    groups.push({
      monthKey: key,
      displayTitle: `${y}년 ${parseInt(m, 10)}월`,
      items,
    });
  });

  groups.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  return groups;
}

export const PhotosHubView: React.FC<PhotosHubViewProps> = ({
  storages,
  onOpenPhoto,
  onShowToast,
}) => {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStorage, setSelectedStorage] = useState<string>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [viewMode, setViewMode] = useState<'albums' | 'timeline'>('albums');
  const [selectedAlbumKey, setSelectedAlbumKey] = useState<string | null>(null);
  const [detailPhoto, setDetailPhoto] = useState<PhotoItem | null>(null);

  const fetchPhotos = async () => {
    setIsLoading(true);
    try {
      const data = await api.getPhotos(
        selectedStorage === 'all' ? undefined : selectedStorage
      );
      setPhotos(data);
    } catch (err: any) {
      onShowToast(`사진 로드 실패: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, [selectedStorage]);

  useEffect(() => {
    setSelectedAlbumKey(null);
  }, [selectedStorage]);

  // Filter client-side by mediaType so album list and activeAlbum remain stable without extra disk roundtrips
  const filteredPhotos = useMemo<PhotoItem[]>(() => {
    if (mediaTypeFilter === 'all') return photos;
    return photos.filter(p => p.mediaType === mediaTypeFilter);
  }, [photos, mediaTypeFilter]);

  const albumGroups = useMemo<AlbumGroup[]>(() => {
    const map = new Map<string, PhotoItem[]>();

    for (const item of filteredPhotos) {
      const albumName = item.album || '기본 앨범';
      const key = `${item.storageId}:${albumName}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    }

    const result: AlbumGroup[] = [];
    map.forEach((items, key) => {
      const first = items[0];
      const coverItem = items.find(it => it.mediaType === 'image') || first;
      let imageCount = 0;
      let videoCount = 0;
      let totalSize = 0;
      let minDate = getEffectiveDate(first);
      let maxDate = minDate;

      for (const it of items) {
        if (it.mediaType === 'image') imageCount++;
        else videoCount++;
        totalSize += it.size;
        const d = getEffectiveDate(it);
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
      }

      const startYM = formatYearMonth(minDate);
      const endYM = formatYearMonth(maxDate);
      const dateRangeLabel = startYM === endYM ? startYM : `${startYM} ~ ${endYM}`;

      result.push({
        key,
        albumName: first.album || '기본 앨범',
        storageId: first.storageId,
        storageName: first.storageName,
        items,
        coverItem,
        imageCount,
        videoCount,
        totalSize,
        latestTakenAt: maxDate.toISOString(),
        dateRangeLabel,
      });
    });

    result.sort((a, b) => b.latestTakenAt.localeCompare(a.latestTakenAt));
    return result;
  }, [filteredPhotos]);

  const activeAlbum = useMemo<AlbumGroup | null>(() => {
    if (!selectedAlbumKey) return null;
    const found = albumGroups.find(g => g.key === selectedAlbumKey);
    if (found) return found;
    // If current mediaTypeFilter yielded 0 items in this album, preserve album shell so user stays in the album
    const rawMatch = photos.find(p => `${p.storageId}:${p.album || '기본 앨범'}` === selectedAlbumKey);
    if (!rawMatch) return null;
    return {
      key: selectedAlbumKey,
      albumName: rawMatch.album || '기본 앨범',
      storageId: rawMatch.storageId,
      storageName: rawMatch.storageName,
      items: [],
      coverItem: rawMatch,
      imageCount: 0,
      videoCount: 0,
      totalSize: 0,
      latestTakenAt: rawMatch.takenAt || rawMatch.modTime,
      dateRangeLabel: '-',
    };
  }, [albumGroups, selectedAlbumKey, photos]);

  const timelineGroups = useMemo<TimelineMonthGroup[]>(() => {
    const sourceList = viewMode === 'albums' && activeAlbum ? activeAlbum.items : filteredPhotos;
    return buildTimelineGroups(sourceList);
  }, [filteredPhotos, viewMode, activeAlbum]);

  const toFileItem = (p: PhotoItem): FileItem => ({
    name: p.name,
    path: p.relPath,
    isDir: false,
    size: p.size,
    modTime: p.takenAt || p.modTime,
    ext: p.ext,
    mediaType: p.mediaType,
  });

  const handleItemClick = (photo: PhotoItem, scopeItems: PhotoItem[]) => {
    const fileItem = toFileItem(photo);
    const playlist = scopeItems.map(toFileItem);
    onOpenPhoto(fileItem, photo.storageId, playlist);
  };

  const totalImages = photos.filter(p => p.mediaType === 'image').length;
  const totalVideos = photos.filter(p => p.mediaType === 'video').length;

  const renderPhotoGrid = (items: PhotoItem[], playlistScope: PhotoItem[], showAlbumBadge: boolean) => (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5 sm:gap-2">
      {items.map(photo => {
        const isVideo = photo.mediaType === 'video';
        const isHeic = photo.ext.toLowerCase() === '.heic' || photo.ext.toLowerCase() === '.heif';
        const takenDate = getEffectiveDate(photo).toLocaleDateString();

        return (
          <div
            key={photo.id}
            onClick={() => handleItemClick(photo, playlistScope)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDetailPhoto(photo);
            }}
            className="group relative aspect-square rounded-md overflow-hidden bg-surface-card border border-surface-border hover:border-accent/40 cursor-pointer select-none transition active:scale-[0.98] touch-manipulation"
            title={`${photo.name} · ${takenDate}${photo.cameraModel ? ` · ${photo.cameraModel}` : ''} (${formatBytes(photo.size)})`}
          >
            {isVideo ? (
              <VideoThumbnail
                relPath={photo.relPath}
                storageId={photo.storageId}
                ext={photo.ext}
                alt={photo.name}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-surface-base overflow-hidden">
                <img
                  src={api.getPhotoThumbUrl(photo.relPath, photo.storageId, photo.size, photo.modTime)}
                  alt={photo.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {isHeic && (
              <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-cyan-300 border border-cyan-500/20 text-[9px] font-bold font-mono flex items-center gap-1 shadow pointer-events-none z-10">
                <span>HEIC</span>
              </div>
            )}

            {/* Quick Details (i) Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDetailPhoto(photo);
              }}
              className="hidden sm:flex absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-black/75 hover:bg-black text-gray-200 hover:text-white border border-white/15 z-10"
              title="상세 메타 정보 보기"
            >
              <Info className="w-3 h-3" />
            </button>

            {/* Single Unified Non-Overlapping Bottom Caption Bar */}
            <div className="hidden sm:flex absolute inset-x-1 bottom-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 backdrop-blur-sm text-[9px] font-mono text-gray-200 px-1.5 py-0.5 rounded items-center gap-1 border border-white/10 pointer-events-none">
              {photo.dateSource === 'exif' && (
                <Camera className="w-2.5 h-2.5 text-emerald-300 shrink-0" />
              )}
              <span className="truncate">
                {takenDate}{showAlbumBadge && photo.album ? ` · ${photo.album}` : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-2.5 sm:p-6 space-y-4 text-content-primary overscroll-y-contain">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-3 border-b border-surface-border text-xs">
        {/* Storage Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedStorage('all')}
            className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
              selectedStorage === 'all'
                ? 'bg-surface-card border border-surface-border font-medium text-content-primary'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            전체 ({filteredPhotos.length})
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

        {/* View Mode & Media Type Toggle */}
        <div className="w-full sm:w-auto flex flex-wrap items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
          {/* Album vs Timeline View Switch */}
          <div className="flex items-center bg-surface-card border border-surface-border rounded-md p-0.5">
            <button
              onClick={() => {
                setViewMode('albums');
                setSelectedAlbumKey(null);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded transition whitespace-nowrap ${
                viewMode === 'albums'
                  ? 'bg-surface-cardHover text-content-primary font-medium'
                  : 'text-content-muted hover:text-content-primary'
              }`}
            >
              <Folder className="w-3 h-3" />
              <span>앨범 ({albumGroups.length})</span>
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded transition whitespace-nowrap ${
                viewMode === 'timeline'
                  ? 'bg-surface-cardHover text-content-primary font-medium'
                  : 'text-content-muted hover:text-content-primary'
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>타임라인</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Media Type Filter */}
            <div className="flex items-center bg-surface-card border border-surface-border rounded-md p-0.5">
              <button
                onClick={() => setMediaTypeFilter('all')}
                className={`px-2 py-0.5 rounded transition whitespace-nowrap ${
                  mediaTypeFilter === 'all' 
                    ? 'bg-surface-cardHover text-content-primary font-medium' 
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setMediaTypeFilter('image')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded transition whitespace-nowrap ${
                  mediaTypeFilter === 'image' 
                    ? 'bg-surface-cardHover text-content-primary font-medium' 
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                <ImageIcon className="w-3 h-3" />
                <span>사진 ({totalImages})</span>
              </button>
              <button
                onClick={() => setMediaTypeFilter('video')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded transition whitespace-nowrap ${
                  mediaTypeFilter === 'video' 
                    ? 'bg-surface-cardHover text-content-primary font-medium' 
                    : 'text-content-muted hover:text-content-primary'
                }`}
              >
                <Film className="w-3 h-3" />
                <span>영상 ({totalVideos})</span>
              </button>
            </div>

            <button
              onClick={fetchPhotos}
              disabled={isLoading}
              className="p-1.5 bg-surface-card hover:bg-surface-cardHover border border-surface-border rounded-md text-content-muted hover:text-content-primary transition disabled:opacity-40"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-2 text-content-muted">
          <RefreshCw className="w-5 h-5 text-accent animate-spin" />
          <p className="text-xs">앨범 및 메타데이터 불러오는 중...</p>
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-2 text-center text-content-muted">
          <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
          <h4 className="text-xs font-medium text-content-secondary">
            포토 전용 폴더에 보관된 사진이나 영상이 없습니다
          </h4>
          <p className="text-[11px] text-content-muted max-w-md">
            저장소 최상위에 '사진', '앨범', 'photos', 'albums' 폴더를 만들어 사진과 일상 영상을 넣으면 이곳에 자동 표시됩니다.
          </p>
        </div>
      ) : viewMode === 'albums' && !activeAlbum ? (
        albumGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-2 text-center text-content-muted">
            <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
            <h4 className="text-xs font-medium text-content-secondary">
              선택한 미디어 종류에 해당하는 앨범이 없습니다
            </h4>
          </div>
        ) : (
          /* Album (Folder) Cards Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-4">
            {albumGroups.map(album => {
              const isCoverVideo = album.coverItem.mediaType === 'video';
              return (
                <div
                  key={album.key}
                  onClick={() => setSelectedAlbumKey(album.key)}
                  className="group bg-surface-card border border-surface-border hover:border-accent/50 rounded-lg overflow-hidden cursor-pointer transition flex flex-col shadow-sm active:scale-[0.99] touch-manipulation"
                >
                  <div className="relative aspect-[4/3] w-full bg-surface-base overflow-hidden">
                    {isCoverVideo ? (
                      <VideoThumbnail
                        relPath={album.coverItem.relPath}
                        storageId={album.coverItem.storageId}
                        ext={album.coverItem.ext}
                        alt={album.albumName}
                      />
                    ) : (
                      <img
                        src={api.getPhotoThumbUrl(
                          album.coverItem.relPath,
                          album.coverItem.storageId,
                          album.coverItem.size,
                          album.coverItem.modTime
                        )}
                        alt={album.albumName}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    )}
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[10px] font-mono text-white border border-white/10">
                      {album.items.length}개
                    </div>
                  </div>

                  <div className="p-2.5 sm:p-3 flex flex-col gap-1">
                    <h3 className="text-xs font-semibold text-content-primary truncate">
                      {album.albumName}
                    </h3>

                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-content-muted font-mono gap-1">
                      <span className="truncate">{album.dateRangeLabel}</span>
                      <span className="shrink-0">{formatBytes(album.totalSize)}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-content-secondary pt-1 border-t border-surface-borderSubtle gap-1">
                      <span className="truncate">
                        사진 {album.imageCount} · 영상 {album.videoCount}
                      </span>
                      <span className="text-content-muted truncate max-w-[45%]">
                        {album.storageName}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Selected Album Detail OR Full Shooting Date Timeline */
        <div className="space-y-5">
          {viewMode === 'albums' && activeAlbum && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-card border border-surface-border rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={() => setSelectedAlbumKey(null)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-surface-base hover:bg-surface-cardHover border border-surface-border text-xs text-content-secondary hover:text-content-primary transition shrink-0"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>앨범 목록</span>
                </button>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-semibold text-content-primary truncate">
                    {activeAlbum.albumName}
                  </h3>
                  <p className="text-[11px] text-content-muted font-mono truncate">
                    {activeAlbum.dateRangeLabel} · 사진 {activeAlbum.imageCount} · 영상 {activeAlbum.videoCount} ({formatBytes(activeAlbum.totalSize)})
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-content-muted px-2 py-0.5 rounded bg-surface-base border border-surface-borderSubtle">
                {activeAlbum.storageName}
              </span>
            </div>
          )}

          {timelineGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-2 text-center text-content-muted">
              <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
              <h4 className="text-xs font-medium text-content-secondary">
                선택한 조건에 해당하는 미디어가 없습니다
              </h4>
            </div>
          ) : (
            timelineGroups.map(group => {
              const isInsideAlbum = viewMode === 'albums' && Boolean(activeAlbum);
              const scopeItems = isInsideAlbum && activeAlbum ? activeAlbum.items : filteredPhotos;
              return (
                <div key={group.monthKey} className="space-y-2.5">
                  <div className="sticky top-0 bg-surface-base/95 backdrop-blur-sm py-1.5 z-20 flex items-center justify-between border-b border-surface-border">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-content-muted" />
                      <h3 className="text-xs font-semibold text-content-primary tracking-tight">
                        {group.displayTitle}
                      </h3>
                      <span className="text-[11px] font-mono text-content-muted">
                        ({group.items.length})
                      </span>
                    </div>
                  </div>

                  {renderPhotoGrid(group.items, scopeItems, !isInsideAlbum)}
                </div>
              );
            })
          )}
        </div>
      )}

      {detailPhoto && (
        <FileDetailsModal
          item={toFileItem(detailPhoto)}
          storageId={detailPhoto.storageId}
          storageName={detailPhoto.storageName}
          onClose={() => setDetailPhoto(null)}
          onOpenMedia={(fileItem) => {
            const scopeItems = viewMode === 'albums' && activeAlbum ? activeAlbum.items : filteredPhotos;
            onOpenPhoto(fileItem, detailPhoto.storageId, scopeItems.map(toFileItem));
          }}
        />
      )}
    </div>
  );
};
