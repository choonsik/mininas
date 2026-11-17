import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Repeat, 
  Repeat1, 
  Shuffle, 
  ListMusic, 
  X, 
  Music,
  Disc3
} from 'lucide-react';
import { AudioTrack } from '../types';
import { api } from '../api';

interface GlobalAudioPlayerProps {
  currentTrack: AudioTrack | null;
  playlist: AudioTrack[];
  onTrackChange: (track: AudioTrack) => void;
  onClose: () => void;
}

type RepeatMode = 'none' | 'all' | 'one';

const TrackCoverImage: React.FC<{ track: AudioTrack; isPlaying: boolean }> = ({ track, isPlaying }) => {
  const [hasError, setHasError] = useState(false);
  const coverUrl = api.getMusicCoverUrl(track.path, track.storageId);

  useEffect(() => {
    setHasError(false);
  }, [track.id, track.path, track.storageId]);

  if (hasError) {
    return <Disc3 className={`w-5 h-5 text-accent transition-transform duration-700 ${isPlaying ? 'animate-spin' : ''}`} />;
  }

  return (
    <img
      src={coverUrl}
      alt="Cover"
      onError={() => setHasError(true)}
      className="w-full h-full object-cover"
    />
  );
};

export const GlobalAudioPlayer: React.FC<GlobalAudioPlayerProps> = ({
  currentTrack,
  playlist,
  onTrackChange,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('mininas_audio_volume');
    return saved !== null ? parseFloat(saved) : 0.85;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => {
    const saved = localStorage.getItem('mininas_audio_repeat') as RepeatMode;
    return saved === 'all' || saved === 'one' ? saved : 'all';
  });
  const [isShuffle, setIsShuffle] = useState(() => {
    return localStorage.getItem('mininas_audio_shuffle') === 'true';
  });
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

  // Current track index in playlist
  const currentIndex = playlist.findIndex(
    t => t.id === currentTrack?.id || (t.path === currentTrack?.path && t.storageId === currentTrack?.storageId)
  );

  // Format time mm:ss
  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '00:00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Sync volume with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    localStorage.setItem('mininas_audio_volume', volume.toString());
  }, [volume, isMuted]);

  useEffect(() => {
    localStorage.setItem('mininas_audio_repeat', repeatMode);
  }, [repeatMode]);

  useEffect(() => {
    localStorage.setItem('mininas_audio_shuffle', isShuffle.toString());
  }, [isShuffle]);

  // When currentTrack changes, reset time & play
  useEffect(() => {
    if (!currentTrack) return;
    setCurrentTime(0);
    setIsPlaying(true);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            if (err && err.name !== 'AbortError') {
              console.warn('Playback error or policy deferred:', err);
            }
          });
      }
    }
  }, [currentTrack]);

  // Toggle Play / Pause
  const handleTogglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  // Next Track
  const handleNext = useCallback(() => {
    if (playlist.length === 0) return;

    if (repeatMode === 'one' && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      return;
    }

    if (isShuffle && playlist.length > 1) {
      let nextIdx = Math.floor(Math.random() * playlist.length);
      if (nextIdx === currentIndex) {
        nextIdx = (nextIdx + 1) % playlist.length;
      }
      onTrackChange(playlist[nextIdx]);
      return;
    }

    if (currentIndex >= 0 && currentIndex < playlist.length - 1) {
      onTrackChange(playlist[currentIndex + 1]);
    } else if (repeatMode === 'all') {
      onTrackChange(playlist[0]);
    } else {
      setIsPlaying(false);
    }
  }, [playlist, currentIndex, repeatMode, isShuffle, onTrackChange]);

  // Prev Track
  const handlePrev = () => {
    if (!audioRef.current || playlist.length === 0) return;

    // If more than 3 seconds played, rewind to start
    if (currentTime > 3) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    if (currentIndex > 0) {
      onTrackChange(playlist[currentIndex - 1]);
    } else if (repeatMode === 'all') {
      onTrackChange(playlist[playlist.length - 1]);
    }
  };

  // Toggle Repeat Mode
  const handleCycleRepeat = () => {
    setRepeatMode(prev => {
      if (prev === 'none') return 'all';
      if (prev === 'all') return 'one';
      return 'none';
    });
  };

  // Seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  if (!currentTrack) return null;

  const streamUrl = api.getStreamUrl(currentTrack.path, currentTrack.storageId);

  return (
    <>
      {/* Native HTML5 Audio Element */}
      <audio
        ref={audioRef}
        src={streamUrl}
        autoPlay
        playsInline
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={handleNext}
        onError={(e) => {
          console.error('Audio playback error:', e);
          setIsPlaying(false);
        }}
      />

      {/* Playlist Drawer (Floating above bar) */}
      {isPlaylistOpen && (
        <div className="fixed bottom-[74px] right-4 z-40 w-80 max-w-[calc(100vw-32px)] bg-surface-card border border-surface-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[380px] animate-slideUp text-content-primary">
          <div className="p-3 border-b border-surface-border bg-surface-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold">재생 대기열 ({playlist.length}곡)</span>
            </div>
            <button
              onClick={() => setIsPlaylistOpen(false)}
              className="p-1 rounded text-content-muted hover:text-content-primary transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 divide-y divide-surface-borderSubtle">
            {playlist.map((track, idx) => {
              const isSelected = track.id === currentTrack.id || (track.path === currentTrack.path && track.storageId === currentTrack.storageId);
              return (
                <button
                  key={`${track.storageId}-${track.path}-${idx}`}
                  onClick={() => onTrackChange(track)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2.5 transition text-xs ${
                    isSelected
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-content-secondary hover:bg-surface-cardHover hover:text-content-primary'
                  }`}
                >
                  <span className="w-4 text-[10px] font-mono opacity-60 text-center shrink-0">
                    {isSelected && isPlaying ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-accent animate-ping" />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs">{track.title || track.path.split('/').pop()}</p>
                    {track.artist && (
                      <p className="text-[10px] text-content-muted truncate">{track.artist}</p>
                    )}
                  </div>
                  {track.storageName && (
                    <span className="text-[9px] font-mono text-content-muted px-1.5 py-0.5 rounded bg-surface-base shrink-0">
                      {track.storageName}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Bottom Audio Player Bar */}
      <aside 
        aria-label="글로벌 오디오 플레이어"
        className="fixed bottom-0 left-0 right-0 z-40 bg-surface-card/95 backdrop-blur-md border-t border-surface-border shadow-2xl h-[70px] px-3 sm:px-6 flex items-center justify-between select-none text-content-primary transition-all duration-200"
      >
        {/* Left: Track Info */}
        <div className="flex items-center gap-3 w-1/4 min-w-[140px] max-w-[260px] truncate">
          <div className="relative w-10 h-10 rounded-lg bg-surface-base border border-surface-border flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
            <TrackCoverImage track={currentTrack} isPlaying={isPlaying} />
          </div>
          <div className="min-w-0 flex-1 truncate">
            <p className="text-xs font-semibold truncate text-content-primary">
              {currentTrack.title || currentTrack.path.split('/').pop()}
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-content-muted truncate mt-0.5">
              <span className="truncate">{currentTrack.artist || currentTrack.album || 'MiniNAS Audio'}</span>
              {currentTrack.storageName && (
                <>
                  <span>·</span>
                  <span className="font-mono text-content-secondary shrink-0">{currentTrack.storageName}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center: Controls & Scrubber */}
        <div className="flex-1 max-w-xl px-2 sm:px-6 flex flex-col items-center justify-center gap-1">
          {/* Top Row: Buttons */}
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setIsShuffle(prev => !prev)}
              className={`p-1.5 rounded-full transition ${
                isShuffle ? 'text-accent' : 'text-content-muted hover:text-content-primary'
              }`}
              title={isShuffle ? '셔플 켜짐' : '셔플 꺼짐'}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handlePrev}
              className="p-1.5 rounded-full text-content-secondary hover:text-content-primary hover:bg-surface-cardHover transition"
              title="이전 곡"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={handleTogglePlay}
              className="w-8 h-8 rounded-full bg-accent-btn text-accent-btnText border border-accent-btnBorder flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition"
              title={isPlaying ? '일시 정지 (Space)' : '재생 (Space)'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              onClick={handleNext}
              className="p-1.5 rounded-full text-content-secondary hover:text-content-primary hover:bg-surface-cardHover transition"
              title="다음 곡"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <button
              onClick={handleCycleRepeat}
              className={`p-1.5 rounded-full transition relative ${
                repeatMode !== 'none' ? 'text-accent' : 'text-content-muted hover:text-content-primary'
              }`}
              title={`반복 모드: ${repeatMode === 'none' ? '꺼짐' : repeatMode === 'all' ? '전체 반복' : '한 곡 반복'}`}
            >
              {repeatMode === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Bottom Row: Scrubber */}
          <div className="w-full flex items-center gap-2 text-[10px] font-mono text-content-muted">
            <span className="w-8 text-right shrink-0">{formatTime(currentTime)}</span>
            <div className="relative flex-1 flex items-center group">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-surface-borderSubtle group-hover:h-1.5 rounded-full appearance-none cursor-pointer transition-all accent-accent focus:outline-none"
              />
            </div>
            <span className="w-8 shrink-0">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Extra Controls (Queue, Volume, Close) */}
        <div className="flex items-center justify-end gap-2 sm:gap-3 w-1/4 min-w-[120px] max-w-[240px]">
          {/* Playlist Queue Button */}
          {playlist.length > 0 && (
            <button
              onClick={() => setIsPlaylistOpen(prev => !prev)}
              className={`p-1.5 rounded-lg flex items-center gap-1 text-xs transition ${
                isPlaylistOpen 
                  ? 'bg-accent/15 text-accent font-semibold' 
                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-cardHover'
              }`}
              title="재생 대기열 목록"
            >
              <ListMusic className="w-4 h-4" />
              <span className="hidden md:inline font-mono text-[10px]">
                {currentIndex >= 0 ? `${currentIndex + 1}/${playlist.length}` : playlist.length}
              </span>
            </button>
          )}

          {/* Volume Control */}
          <div className="hidden sm:flex items-center gap-1.5">
            <button
              onClick={() => setIsMuted(prev => !prev)}
              className="p-1 rounded text-content-secondary hover:text-content-primary transition"
              title={isMuted ? '음소거 해제' : '음소거'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              className="w-16 h-1 bg-surface-borderSubtle rounded-full appearance-none cursor-pointer accent-accent"
              title={`볼륨: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
          </div>

          {/* Close / Dismiss Player */}
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.pause();
              }
              onClose();
            }}
            className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface-cardHover transition ml-1"
            title="플레이어 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
};
