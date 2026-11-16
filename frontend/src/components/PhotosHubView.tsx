import React, { useState, useEffect, useMemo } from 'react';
import { 
  Camera, 
  Image as ImageIcon, 
  Film, 
  RefreshCw, 
  Calendar, 
  HardDrive, 
  Sparkles,
  Layers,
  Play,
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

// Group photos by Year-Month (e.g. "2026년 11월")
interface TimelineMonthGroup {
  monthKey: string;     // "2026-11"
  displayTitle: string; // "2026년 11월"
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
  const [skipSpecial, setSkipSpecial] = useState<boolean>(true); // 기본값: 시네마(영화/드라마) 및 웹 폴더 제외로 깔끔한 일상 사진/영상 뷰 제공

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
      onShowToast(`사진 & 모먼트 로드 실패: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, [selectedStorage, mediaTypeFilter, skipSpecial]);

  // Group photos into Year-Month sections
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

    // Sort chronologically desc (newest months first)
    groups.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    return groups;
  }, [photos]);

  // Convert all items to FileItems for seamless Lightbox / Slider navigation
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
    const targetFile: FileItem = {
      name: photo.name,
      path: photo.relPath,
      isDir: false,
      size: photo.size,
      modTime: photo.modTime,
      ext: photo.ext,
      mediaType: photo.mediaType,
    };
    onOpenPhoto(targetFile, photo.storageId, allAsFileItems);
  };

  const totalImages = photos.filter(p => p.mediaType === 'image').length;
  const totalVideos = photos.filter(p => p.mediaType === 'video').length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
      {/* Filter Chips & Type Toggle Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Storage Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedStorage('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              selectedStorage === 'all'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-950/50'
                : 'bg-[#181824] text-gray-400 hover:text-white hover:bg-[#222232] border border-[#262638]'
            }`}
          >
            전체 ({photos.length})
          </button>
          {storages.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedStorage(s.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedStorage === s.id
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-950/50'
                  : 'bg-[#181824] text-gray-400 hover:text-white hover:bg-[#222232] border border-[#262638]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Media Type Toggle & Refresh */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <div className="flex items-center bg-[#151520] border border-[#262638] rounded-xl p-1">
            <button
              onClick={() => setMediaTypeFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                mediaTypeFilter === 'all' 
                  ? 'bg-amber-500/20 text-amber-300 font-semibold shadow-sm' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              전체 ({photos.length})
            </button>
            <button
              onClick={() => setMediaTypeFilter('image')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition ${
                mediaTypeFilter === 'image' 
                  ? 'bg-amber-500/20 text-amber-300 font-semibold shadow-sm' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3 h-3" />
              <span>사진 ({totalImages})</span>
            </button>
            <button
              onClick={() => setMediaTypeFilter('video')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition ${
                mediaTypeFilter === 'video' 
                  ? 'bg-amber-500/20 text-amber-300 font-semibold shadow-sm' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Film className="w-3 h-3" />
              <span>영상 ({totalVideos})</span>
            </button>
          </div>

          {/* Skip Special Folders Toggle */}
          <button
            onClick={() => setSkipSpecial(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition border ${
              skipSpecial
                ? 'bg-blue-600/15 border-blue-500/30 text-blue-300'
                : 'bg-amber-600/20 border-amber-500/40 text-amber-300 shadow-sm'
            }`}
            title={skipSpecial ? '클릭 시 영화/드라마/웹 폴더의 모든 미디어까지 포함하여 보기' : '클릭 시 영화/드라마/웹 폴더를 제외하고 순수 일상 사진/영상만 보기'}
          >
            <Filter className={`w-3.5 h-3.5 ${skipSpecial ? 'text-blue-400' : 'text-amber-400'}`} />
            <span>{skipSpecial ? '시네마/웹 제외' : '모든 폴더 포함'}</span>
          </button>

          <button
            onClick={fetchPhotos}
            disabled={isLoading}
            className="p-2 bg-[#181824] hover:bg-[#222232] border border-[#262638] rounded-xl text-gray-400 hover:text-white transition disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Timeline Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-[#15151e] border border-[#232330] rounded-2xl">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-sm text-gray-300">저장소 전체의 사진과 일상 영상 스캔 중...</p>
        </div>
      ) : timelineGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-[#15151e] border border-[#232330] rounded-2xl text-center">
          <ImageIcon className="w-10 h-10 text-gray-600" />
          <h4 className="text-base font-bold text-gray-200">
            보관된 사진이나 비디오가 없습니다.
          </h4>
          <p className="text-xs text-gray-400 max-w-md">
            저장소의 어떤 폴더에든 사진(JPG, PNG, HEIC)이나 비디오 클립을 넣어두시면 자동으로 타임라인에 등록됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {timelineGroups.map(group => (
            <div key={group.monthKey} className="space-y-3">
              {/* Sticky Month Section Header */}
              <div className="sticky top-0 bg-[#0d0d14]/90 backdrop-blur-md py-2.5 z-20 flex items-center justify-between border-b border-[#222230]">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    {group.displayTitle}
                  </h3>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {group.items.length}개
                  </span>
                </div>
              </div>

              {/* Square Photos & Clips Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-2.5">
                {group.items.map(photo => {
                  const isVideo = photo.mediaType === 'video';
                  const isHeic = photo.ext.toLowerCase() === '.heic' || photo.ext.toLowerCase() === '.heif';

                  return (
                    <div
                      key={photo.id}
                      onClick={() => handleItemClick(photo)}
                      className="group relative aspect-square rounded-xl overflow-hidden bg-[#161622] border border-[#252535] hover:border-amber-500/60 cursor-pointer select-none transition-all duration-200 hover:shadow-lg hover:shadow-amber-950/20"
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
                        <div className="w-full h-full flex items-center justify-center bg-[#0c0c12] overflow-hidden">
                          <img
                            src={api.getStreamUrl(photo.relPath, photo.storageId)}
                            alt={photo.name}
                            loading="lazy"
                            className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                      )}

                      {/* HEIC Badge */}
                      {isHeic && (
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-emerald-300 text-[9px] font-bold font-mono shadow">
                          HEIC
                        </div>
                      )}

                      {/* Storage Mini Pill (bottom-right on hover) */}
                      <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 backdrop-blur-md text-[9px] font-mono text-gray-300 px-1.5 py-0.5 rounded border border-gray-700 truncate max-w-[85%]">
                        {photo.storageName}
                      </div>

                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
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
