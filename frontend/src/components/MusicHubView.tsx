import React, { useState, useEffect, useMemo } from 'react';
import { 
  Music, 
  Play, 
  Search, 
  RefreshCw, 
  HardDrive, 
  Folder, 
  Shuffle, 
  Disc, 
  User, 
  Clock, 
  ExternalLink 
} from 'lucide-react';
import { StorageInfo, MusicItem, AudioTrack } from '../types';
import { api } from '../api';
import { formatBytes } from '../utils/format';

interface MusicHubViewProps {
  storages: StorageInfo[];
  onPlayTrack: (track: AudioTrack, playlist: AudioTrack[]) => void;
  currentTrackId?: string;
  onNavigateToStorage: (storageId: string, path: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const MusicCoverImage: React.FC<{
  relPath: string;
  storageId: string;
  className?: string;
  fallbackIcon?: React.ReactNode;
}> = ({
  relPath,
  storageId,
  className = "w-full h-full object-cover",
  fallbackIcon,
}) => {
  const [hasError, setHasError] = useState(false);
  const coverUrl = api.getMusicCoverUrl(relPath, storageId);

  if (hasError) {
    return <>{fallbackIcon}</>;
  }

  return (
    <img
      src={coverUrl}
      alt="Cover"
      loading="lazy"
      onError={() => setHasError(true)}
      className={className}
    />
  );
};

export const MusicHubView: React.FC<MusicHubViewProps> = ({
  storages,
  onPlayTrack,
  currentTrackId,
  onNavigateToStorage,
  onShowToast,
}) => {
  const [selectedStorage, setSelectedStorage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [musicList, setMusicList] = useState<MusicItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'tracks' | 'albums'>('tracks');

  const fetchMusic = async () => {
    setIsLoading(true);
    try {
      const data = await api.getMusicLibrary(selectedStorage === 'all' ? undefined : selectedStorage);
      setMusicList(data);
    } catch (err: any) {
      onShowToast(`음악 라이브러리 로드 실패: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMusic();
  }, [selectedStorage]);

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return musicList;
    const q = searchQuery.toLowerCase();
    return musicList.filter(
      item =>
        item.title.toLowerCase().includes(q) ||
        (item.artist && item.artist.toLowerCase().includes(q)) ||
        (item.album && item.album.toLowerCase().includes(q)) ||
        item.name.toLowerCase().includes(q)
    );
  }, [musicList, searchQuery]);

  // Convert MusicItem to AudioTrack
  const toAudioTrack = (item: MusicItem): AudioTrack => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    album: item.album,
    path: item.relPath,
    storageId: item.storageId,
    storageName: item.storageName,
    size: item.size,
    ext: item.ext,
  });

  const playlist = useMemo(() => filteredTracks.map(toAudioTrack), [filteredTracks]);

  // Play All
  const handlePlayAll = () => {
    if (playlist.length === 0) return;
    onPlayTrack(playlist[0], playlist);
  };

  // Shuffle Play
  const handleShufflePlay = () => {
    if (playlist.length === 0) return;
    const shuffled = [...playlist].sort(() => Math.random() - 0.5);
    onPlayTrack(shuffled[0], shuffled);
  };

  // Grouped by Album / Folder
  const albumGroups = useMemo(() => {
    const map = new Map<string, MusicItem[]>();
    for (const item of filteredTracks) {
      const albumKey = item.album ? `${item.storageId}:${item.album}` : `${item.storageId}:기타 곡`;
      if (!map.has(albumKey)) {
        map.set(albumKey, []);
      }
      map.get(albumKey)!.push(item);
    }

    return Array.from(map.entries()).map(([key, items]) => {
      const first = items[0];
      return {
        key,
        name: first.album || '기타 음악',
        storageName: first.storageName,
        storageId: first.storageId,
        items,
        totalSize: items.reduce((acc, cur) => acc + cur.size, 0),
      };
    });
  }, [filteredTracks]);

  return (
    <div className="flex-1 min-w-0 overflow-y-auto p-2.5 sm:p-6 pb-28 space-y-4 text-content-primary overscroll-y-contain">
      {/* Header & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-3 border-b border-surface-border">
        {/* Storages Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
          <button
            onClick={() => setSelectedStorage('all')}
            className={`px-2.5 py-1 rounded transition whitespace-nowrap ${
              selectedStorage === 'all'
                ? 'bg-surface-card border border-surface-border font-medium text-content-primary shadow-sm'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            전체 ({musicList.length})
          </button>
          {storages.map(st => (
            <button
              key={st.id}
              onClick={() => setSelectedStorage(st.id)}
              className={`px-2.5 py-1 rounded transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedStorage === st.id
                  ? 'bg-surface-card border border-surface-border font-medium text-content-primary shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              <HardDrive className="w-3 h-3 text-content-muted" />
              <span>{st.name}</span>
            </button>
          ))}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              placeholder="곡명, 아티스트, 앨범 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-base border border-surface-border rounded-md pl-8 pr-3 py-1.5 text-xs text-content-primary placeholder:text-content-muted focus:border-accent transition"
            />
          </div>

          <button
            onClick={fetchMusic}
            disabled={isLoading}
            className="p-1.5 rounded-md border border-surface-border bg-surface-card hover:bg-surface-cardHover text-content-secondary transition"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Control Banner: Total Stats, Play All, Shuffle Play, View Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-card border border-surface-border rounded-xl p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-base border border-surface-border flex items-center justify-center text-accent shadow-inner">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-content-primary">음악 라이브러리</h2>
            <p className="text-[11px] text-content-muted">
              총 {filteredTracks.length}곡 · 백그라운드 연속 재생 지원
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {filteredTracks.length > 0 && (
            <>
              <button
                onClick={handlePlayAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-btn hover:bg-accent-btnHover text-accent-btnText border border-accent-btnBorder text-xs font-semibold hover:scale-[1.02] active:scale-[0.98] transition touch-manipulation"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>전체 재생</span>
              </button>

              <button
                onClick={handleShufflePlay}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-base border border-surface-border hover:bg-surface-cardHover text-content-primary text-xs font-medium transition active:scale-[0.98] touch-manipulation"
              >
                <Shuffle className="w-3.5 h-3.5 text-accent" />
                <span>셔플 재생</span>
              </button>
            </>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center border border-surface-border rounded-md overflow-hidden bg-surface-base ml-1">
            <button
              onClick={() => setViewMode('tracks')}
              className={`px-2.5 py-1 text-xs transition ${
                viewMode === 'tracks'
                  ? 'bg-surface-card text-content-primary font-semibold shadow-sm'
                  : 'text-content-muted hover:text-content-primary'
              }`}
            >
              트랙
            </button>
            <button
              onClick={() => setViewMode('albums')}
              className={`px-2.5 py-1 text-xs transition ${
                viewMode === 'albums'
                  ? 'bg-surface-card text-content-primary font-semibold shadow-sm'
                  : 'text-content-muted hover:text-content-primary'
              }`}
            >
              앨범/폴더
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {filteredTracks.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-content-muted gap-2 border border-dashed border-surface-border rounded-xl">
          <Disc className="w-10 h-10 opacity-30 stroke-[1.25]" />
          <h4 className="text-xs font-medium text-content-secondary">
            {searchQuery ? '검색된 음악이 없습니다' : '저장소에 보관된 음악 파일이 없습니다'}
          </h4>
          <p className="text-[11px] text-content-muted max-w-sm text-center">
            MP3, FLAC, M4A, WAV, AAC 음악 파일을 저장소에 업로드하면 이곳에 자동으로 라이브러리가 구축됩니다.
          </p>
        </div>
      ) : viewMode === 'tracks' ? (
        /* Tracks Table View */
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-xs text-content-primary">
              <thead className="bg-surface-header border-b border-surface-border text-[11px] text-content-muted">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center font-mono">#</th>
                  <th className="py-2.5 px-3 font-medium">곡명</th>
                  <th className="py-2.5 px-3 font-medium hidden sm:table-cell w-36 md:w-44 lg:w-52">아티스트</th>
                  <th className="py-2.5 px-3 font-medium hidden md:table-cell w-40 lg:w-64">앨범 / 폴더</th>
                  <th className="py-2.5 px-4 font-medium text-right w-24">용량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-borderSubtle">
                {filteredTracks.map((item, idx) => {
                  const isCurrent = currentTrackId === item.id;
                  const track = toAudioTrack(item);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onPlayTrack(track, playlist)}
                      className={`group hover:bg-surface-cardHover transition select-none cursor-pointer ${
                        isCurrent ? 'bg-accent/10 font-semibold text-accent' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-[10px] text-content-muted">
                        {isCurrent ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-accent animate-ping" />
                        ) : (
                          <>
                            <span className="group-hover:hidden">{idx + 1}</span>
                            <Play className="w-3 h-3 text-accent hidden group-hover:inline-block fill-current align-middle" />
                          </>
                        )}
                      </td>
                      <td className="py-2.5 px-3 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-md bg-surface-base border border-surface-border shrink-0 overflow-hidden flex items-center justify-center shadow-xs">
                            <MusicCoverImage
                              relPath={item.relPath}
                              storageId={item.storageId}
                              className="w-full h-full object-cover"
                              fallbackIcon={<Disc className="w-4 h-4 text-content-muted opacity-50" />}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="truncate" title={item.title}>{item.title}</span>
                              <span className="px-1 py-0.2 rounded bg-surface-base text-[9px] font-mono text-content-muted uppercase border border-surface-border shrink-0">
                                {item.ext.replace('.', '')}
                              </span>
                            </div>
                            {/* Mobile Vertical Sub-info (Artist & Album) */}
                            <div className="text-[10px] text-content-muted truncate sm:hidden mt-0.5 font-mono">
                              {item.artist || '알 수 없는 아티스트'} · {item.album || '미분류'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-content-secondary hidden sm:table-cell truncate" title={item.artist || '—'}>
                        {item.artist || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-content-muted hidden md:table-cell truncate" title={item.album || '루트'}>
                        <span className="flex items-center gap-1.5 truncate">
                          <Folder className="w-3 h-3 text-content-muted shrink-0" />
                          <span className="truncate">{item.album || '루트'}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[11px] text-content-muted whitespace-nowrap">
                        {formatBytes(item.size)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Albums / Folders Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {albumGroups.map((album) => {
            const albumPlaylist = album.items.map(toAudioTrack);
            return (
              <div
                key={album.key}
                onClick={() => onPlayTrack(albumPlaylist[0], albumPlaylist)}
                className="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col justify-between hover:border-accent/40 hover:shadow-md transition select-none group cursor-pointer"
              >
                <div>
                  <div className="aspect-square w-full rounded-lg bg-surface-base border border-surface-border flex items-center justify-center relative overflow-hidden mb-3 shadow-inner">
                    <MusicCoverImage
                      relPath={album.items[0].relPath}
                      storageId={album.items[0].storageId}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      fallbackIcon={
                        <Disc className="w-16 h-16 text-content-muted opacity-40 group-hover:scale-105 transition-transform duration-300" />
                      }
                    />
                    <button
                      onClick={() => onPlayTrack(albumPlaylist[0], albumPlaylist)}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      title="앨범 전곡 재생"
                    >
                      <div className="w-10 h-10 rounded-full bg-accent-btn text-accent-btnText border border-accent-btnBorder flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition">
                        <Play className="w-4 h-4 ml-0.5 fill-current" />
                      </div>
                    </button>
                  </div>

                  <h3 className="font-semibold text-xs text-content-primary truncate">{album.name}</h3>
                  <p className="text-[11px] text-content-muted mt-0.5">
                    {album.items.length}곡 · {formatBytes(album.totalSize)}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-surface-borderSubtle flex items-center justify-between text-[10px] text-content-muted">
                  <span className="font-mono">{album.storageName}</span>
                  <button
                    onClick={() => {
                      const first = album.items[0];
                      const dir = first.relPath.substring(0, first.relPath.lastIndexOf('/')) || '/';
                      onNavigateToStorage(first.storageId, dir);
                    }}
                    className="hover:text-content-primary flex items-center gap-1 transition"
                  >
                    <span>폴더 열기</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
