import React, { useState, useEffect, useMemo } from 'react';
import { 
  Image as ImageIcon, 
  Film, 
  RefreshCw, 
  Calendar, 
  Filter
} from 'lucide-react';
import { StorageInfo, PhotoItem, FileItem } from '../types';
import { api } from '../api';
import { formatBytes } from '../utils/format';
import { VideoThumbnail } from './VideoThumbnail';

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

export const PhotosHubView: React.FC<PhotosHubViewProps> = ({
  storages,
  onOpenPhoto,
  onShowToast,
}) => {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStorage, setSelectedStorage] = useState<string>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [skipSpecial, setSkipSpecial] = useState<boolean>(true);

  const fetchPhotos = async () => {
    setIsLoading(true);
    try {
      const data = await api.getPhotos(
        selectedStorage === 'all' ? undefined : selectedStorage,
        mediaTypeFilter,
        skipSpecial
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
  }, [selectedStorage, mediaTypeFilter, skipSpecial]);

  const timelineGroups = useMemo<TimelineMonthGroup[]>(() => {
    const map = new Map<string, PhotoItem[]>();

    for (const item of photos) {
      const date = new Date(item.modTime);
      const year = isNaN(date.getFullYear()) ? 2026 : date.getFullYear();
      const month = isNaN(date.getMonth()) ? 1 : date.getMonth() + 1;
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
  }, [photos]);

  const allAsFileItems = useMemo<FileItem[]>(() => {
    return photos.map(p => ({
      name: p.name,
      path: p.relPath,
      isDir: false,
      size: p.size,
      modTime: p.modTime,
      ext: p.ext,
      mediaType: p.mediaType,
    }));
  }, [photos]);

  const handleItemClick = (photo: PhotoItem) => {
    const fileItem: FileItem = {
      name: photo.name,
      path: photo.relPath,
      isDir: false,
      size: photo.size,
      modTime: photo.modTime,
      ext: photo.ext,
      mediaType: photo.mediaType,
    };
    onOpenPhoto(fileItem, photo.storageId, allAsFileItems);
  };

  const totalImages = photos.filter(p => p.mediaType === 'image').length;
  const totalVideos = photos.filter(p => p.mediaType === 'video').length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-content-primary">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-surface-border text-xs">
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
            전체 ({photos.length})
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

        {/* Media Type Toggle & Refresh */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <div className="flex items-center bg-surface-card border border-surface-border rounded-md p-0.5">
            <button
              onClick={() => setMediaTypeFilter('all')}
              className={`px-2 py-0.5 rounded transition ${
                mediaTypeFilter === 'all' 
                  ? 'bg-surface-cardHover text-content-primary font-medium' 
                  : 'text-content-muted hover:text-content-primary'
              }`}
            >
              전체
            </button>
            <button
              onClick={() => setMediaTypeFilter('image')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded transition ${
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
              className={`flex items-center gap-1 px-2 py-0.5 rounded transition ${
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
            onClick={() => setSkipSpecial(prev => !prev)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition border ${
              skipSpecial
                ? 'bg-surface-card border-surface-border text-content-secondary'
                : 'bg-surface-cardHover border-accent text-accent'
            }`}
            title={skipSpecial ? '영화/웹 폴더 제외됨' : '모든 폴더 포함됨'}
          >
            <Filter className="w-3 h-3" />
            <span>{skipSpecial ? '일상 사진만' : '전체 포함'}</span>
          </button>

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

      {/* Main Timeline Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-2 text-content-muted">
          <RefreshCw className="w-5 h-5 text-accent animate-spin" />
          <p className="text-xs">사진 스캔 중...</p>
        </div>
      ) : timelineGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-2 text-center text-content-muted">
          <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
          <h4 className="text-xs font-medium text-content-secondary">
            보관된 사진이나 비디오가 없습니다
          </h4>
        </div>
      ) : (
        <div className="space-y-6">
          {timelineGroups.map(group => (
            <div key={group.monthKey} className="space-y-2.5">
              {/* Sticky Month Section Header */}
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

              {/* Square Photos & Clips Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {group.items.map(photo => {
                  const isVideo = photo.mediaType === 'video';
                  const isHeic = photo.ext.toLowerCase() === '.heic' || photo.ext.toLowerCase() === '.heif';

                  return (
                    <div
                      key={photo.id}
                      onClick={() => handleItemClick(photo)}
                      className="group relative aspect-square rounded-md overflow-hidden bg-surface-card border border-surface-border hover:border-accent/40 cursor-pointer select-none transition"
                      title={`${photo.name} (${formatBytes(photo.size)})`}
                    >
                      {/* Photo / Video Preview */}
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
                            src={api.getStreamUrl(photo.relPath, photo.storageId)}
                            alt={photo.name}
                            loading="lazy"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}

                      {/* HEIC Badge */}
                      {isHeic && (
                        <div className="absolute top-1.5 left-1.5 px-1 py-0.2 rounded bg-black/60 text-content-muted text-[9px] font-mono">
                          HEIC
                        </div>
                      )}

                      {/* Storage Mini Pill */}
                      <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-[9px] font-mono text-content-muted px-1 rounded truncate max-w-[85%]">
                        {photo.storageName}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
