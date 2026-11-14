import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { 
  X, 
  Download, 
  Play, 
  Music, 
  FileText, 
  Image as ImageIcon, 
  Globe, 
  Subtitles as SubtitlesIcon, 
  AlertTriangle, 
  Sparkles, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  ListOrdered,
  FolderSync
} from 'lucide-react';
import { FileItem, SubtitleTrack, MediaInspection, MediaCapabilities, BatchConvertJob } from '../types';
import { api } from '../api';
import { formatBytes, truncateMiddle } from '../utils/format';

interface MediaViewerProps {
  item: FileItem | null;
  storageId?: string;
  onClose: () => void;
  items?: FileItem[];
  onNavigateMedia?: (item: FileItem) => void;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({ 
  item, 
  storageId = '', 
  onClose,
  items = [],
  onNavigateMedia 
}) => {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleUrl, setSelectedSubtitleUrl] = useState<string | null>(null);
  const [inspection, setInspection] = useState<MediaInspection | null>(null);
  const [capabilities, setCapabilities] = useState<MediaCapabilities | null>(null);

  // Auto-play next episode/video setting
  const [autoPlayNext, setAutoPlayNext] = useState<boolean>(true);

  // Conversion state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertTarget, setConvertTarget] = useState<'folder' | 'single'>('folder');
  const [replaceOriginal, setReplaceOriginal] = useState(false);
  const [extractSubtitles, setExtractSubtitles] = useState(true);
  const [convertAudio, setConvertAudio] = useState(true);
  const [activeJob, setActiveJob] = useState<BatchConvertJob | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Compute viewable playlist (non-directory files)
  // If multiple items of current mediaType exist, navigate within same mediaType; otherwise all viewable files
  const playlist = useMemo(() => {
    if (!item || items.length === 0) return [];
    const nonDirs = items.filter(i => !i.isDir);
    const sameType = nonDirs.filter(i => i.mediaType === item.mediaType);
    return sameType.length > 1 ? sameType : nonDirs;
  }, [items, item]);

  const currentIndex = useMemo(() => {
    if (!item || playlist.length === 0) return -1;
    return playlist.findIndex(i => i.path === item.path);
  }, [playlist, item]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < playlist.length - 1;

  const prevItem = hasPrev ? playlist[currentIndex - 1] : null;
  const nextItem = hasNext ? playlist[currentIndex + 1] : null;

  const handlePrev = useCallback(() => {
    if (hasPrev && prevItem && onNavigateMedia) {
      onNavigateMedia(prevItem);
    }
  }, [hasPrev, prevItem, onNavigateMedia]);

  const handleNext = useCallback(() => {
    if (hasNext && nextItem && onNavigateMedia) {
      onNavigateMedia(nextItem);
    }
  }, [hasNext, nextItem, onNavigateMedia]);

  useEffect(() => {
    if (!item) return;

    if (item.mediaType === 'video') {
      // 1. Get subtitles
      api.getSubtitles(item.path, storageId)
        .then((subs) => {
          setSubtitles(subs);
          const ko = subs.find((s) => s.language === 'ko');
          if (ko) {
            setSelectedSubtitleUrl(ko.url);
          } else if (subs.length > 0) {
            setSelectedSubtitleUrl(subs[0].url);
          } else {
            setSelectedSubtitleUrl(null);
          }
        })
        .catch(() => setSubtitles([]));

      // 2. Check capabilities and inspect video codec
      api.getMediaCapabilities().then(setCapabilities);
      api.inspectMedia(item.path, storageId).then(setInspection);
    } else {
      setSubtitles([]);
      setSelectedSubtitleUrl(null);
      setInspection(null);
    }

    if (item.mediaType === 'text') {
      setLoadingText(true);
      fetch(api.getStreamUrl(item.path, storageId))
        .then((res) => res.text())
        .then((text) => {
          setTextContent(text);
          setLoadingText(false);
        })
        .catch(() => {
          setTextContent('파일 내용을 불러올 수 없습니다.');
          setLoadingText(false);
        });
    } else {
      setTextContent(null);
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [item, storageId]);

  // Keyboard navigation listener (Capture phase to guarantee consistent navigation across all media)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Consistent navigation across ALL media types (video, image, audio, text)
      if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === '[') {
        e.preventDefault();
        e.stopPropagation();
        handlePrev();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ']') {
        e.preventDefault();
        e.stopPropagation();
        handleNext();
      } else if (e.key === ' ' && item?.mediaType === 'video' && videoRef.current) {
        // Spacebar toggles Play / Pause for video
        e.preventDefault();
        if (videoRef.current.paused) {
          videoRef.current.play();
        } else {
          videoRef.current.pause();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handlePrev, handleNext, onClose, item]);

  // Synchronize subtitle track mode when selectedSubtitleUrl changes or video loads
  const selectSubtitle = (url: string | null) => {
    setSelectedSubtitleUrl(url);
    if (!videoRef.current) return;
    const targetSub = subtitles.find((s) => s.url === url);
    const textTracks = videoRef.current.textTracks;
    for (let i = 0; i < textTracks.length; i++) {
      const t = textTracks[i];
      if (targetSub && t.label === targetSub.label) {
        t.mode = 'showing';
      } else {
        t.mode = 'disabled';
      }
    }
  };

  // When video metadata is loaded, apply default subtitle track
  const handleVideoLoaded = () => {
    if (selectedSubtitleUrl) {
      selectSubtitle(selectedSubtitleUrl);
    }
  };

  // Video ended -> auto play next video if enabled
  const handleVideoEnded = () => {
    if (autoPlayNext && hasNext) {
      handleNext();
    }
  };

  // Polling for conversion job
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'running') {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    pollTimerRef.current = window.setInterval(async () => {
      try {
        const job = await api.getBatchConvertStatus(activeJob.id);
        setActiveJob(job);
        if (job.status === 'completed' || job.status === 'failed') {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          if (job.status === 'completed' && item) {
            // Refresh subtitles & inspection
            api.getSubtitles(item.path, storageId).then((subs) => {
              setSubtitles(subs);
              const ko = subs.find((s) => s.language === 'ko');
              if (ko) selectSubtitle(ko.url);
            });
            api.inspectMedia(item.path, storageId).then(setInspection);
          }
        }
      } catch {
        // Ignore polling error
      }
    }, 1500);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [activeJob, item, storageId]);

  if (!item) return null;

  const streamUrl = api.getStreamUrl(item.path, storageId);

  const startConversion = async () => {
    if (!item) return;
    try {
      const parentDir = item.path.substring(0, item.path.lastIndexOf('/')) || '/';
      const targetPath = convertTarget === 'folder' ? parentDir : item.path;

      const job = await api.startBatchConvert({
        storage: storageId,
        path: targetPath,
        extractSubtitles,
        convertAudio,
        replaceOriginal,
      });

      setActiveJob(job);
      setShowConvertModal(false);
    } catch (err: any) {
      alert(err.message || '변환 작업 시작 중 오류가 발생했습니다.');
    }
  };

  // Subtitle categorizations
  const koSubs = subtitles.filter((s) => s.language === 'ko');
  const enSub = subtitles.find((s) => s.language === 'en');
  const jaSub = subtitles.find((s) => s.language === 'ja');

  // Track URLs assigned to quick buttons
  const quickUrls = new Set<string>();
  koSubs.forEach((s) => quickUrls.add(s.url));
  if (enSub) quickUrls.add(enSub.url);
  if (jaSub) quickUrls.add(jaSub.url);

  // Remaining subtitle tracks for the dropdown
  const otherSubs = subtitles.filter((s) => !quickUrls.has(s.url));

  // Check if video actually needs conversion
  const isWebFile = item ? item.name.includes('_web') : false;
  const needsConversion = !isWebFile && (inspection === null || inspection.needsConversion);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between animate-fadeIn select-none">
      {/* Top Header */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-white/10 bg-black/60 z-20">
        {/* Left: File Info & Icon */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-white/10 text-white shrink-0">
            {item.mediaType === 'image' && <ImageIcon className="w-5 h-5 text-emerald-400" />}
            {item.mediaType === 'video' && <Play className="w-5 h-5 text-violet-400" />}
            {item.mediaType === 'audio' && <Music className="w-5 h-5 text-pink-400" />}
            {item.mediaType === 'text' && <FileText className="w-5 h-5 text-amber-400" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-medium text-sm truncate max-w-md sm:max-w-lg" title={item.name}>
              {truncateMiddle(item.name, 60)}
            </h3>
            <span className="text-xs text-gray-400 font-mono">{formatBytes(item.size)}</span>
          </div>
        </div>

        {/* Center: Navigation Controls (Prev / Index / Next) */}
        {playlist.length > 1 && (
          <div className="flex items-center gap-2 bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl shadow-inner">
            <button
              onClick={handlePrev}
              disabled={!hasPrev}
              className={`p-1 rounded-lg transition ${
                hasPrev 
                  ? 'text-gray-200 hover:text-white hover:bg-white/15' 
                  : 'text-gray-600 cursor-not-allowed'
              }`}
              title={hasPrev && prevItem ? `이전 파일: ${prevItem.name} (단축키: Shift+← / [)` : '이전 파일 없음'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 px-2 text-xs font-mono text-gray-300">
              <ListOrdered className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-bold text-white">{currentIndex + 1}</span>
              <span className="text-gray-500">/</span>
              <span className="text-gray-400">{playlist.length}</span>
            </div>

            <button
              onClick={handleNext}
              disabled={!hasNext}
              className={`p-1 rounded-lg transition ${
                hasNext 
                  ? 'text-gray-200 hover:text-white hover:bg-white/15' 
                  : 'text-gray-600 cursor-not-allowed'
              }`}
              title={hasNext && nextItem ? `다음 파일: ${nextItem.name} (단축키: Shift+→ / ])` : '다음 파일 없음'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {item.mediaType === 'video' && playlist.length > 1 && (
            <label className="hidden md:flex items-center gap-1.5 text-xs text-gray-300 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-white/10 transition" title="영상 종료 시 다음 파일 자동 재생">
              <input
                type="checkbox"
                checked={autoPlayNext}
                onChange={(e) => setAutoPlayNext(e.target.checked)}
                className="rounded bg-black/40 border-white/20 text-blue-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="text-[11px]">다음 영상 자동 재생</span>
            </label>
          )}

          {item.mediaType === 'video' && needsConversion && (
            <button
              onClick={() => setShowConvertModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition shadow-sm"
              title="오디오 AAC 변환 및 내장 자막 추출 (폴더 전체 또는 단일 파일)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              웹 호환 변환
            </button>
          )}

          {(item.ext === '.html' || item.ext === '.htm') && (
            <button
              onClick={() => window.open(api.getHostUrl(item.path, storageId), '_blank')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow-sm"
              title="새 탭에서 실제 완성된 웹페이지로 렌더링"
            >
              <Globe className="w-4 h-4" />
              웹페이지로 열기
            </button>
          )}

          <a
            href={api.getDownloadUrl(item.path, storageId)}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition"
          >
            <Download className="w-4 h-4" />
            다운로드
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition"
            title="닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Floating Prev / Next Navigation Buttons on left & right sides */}
      {playlist.length > 1 && (
        <>
          {/* Previous Floating Button */}
          <button
            onClick={handlePrev}
            disabled={!hasPrev}
            className={`fixed left-4 top-1/2 -translate-y-1/2 z-40 p-3.5 rounded-full backdrop-blur-md border transition-all duration-200 group ${
              hasPrev
                ? 'bg-black/60 hover:bg-black/90 border-white/20 hover:border-white/40 text-white hover:scale-110 shadow-2xl cursor-pointer'
                : 'opacity-0 pointer-events-none'
            }`}
            title={prevItem ? `이전: ${prevItem.name}` : ''}
          >
            <ChevronLeft className="w-6 h-6 transform group-hover:-translate-x-0.5 transition-transform" />
          </button>

          {/* Next Floating Button */}
          <button
            onClick={handleNext}
            disabled={!hasNext}
            className={`fixed right-4 top-1/2 -translate-y-1/2 z-40 p-3.5 rounded-full backdrop-blur-md border transition-all duration-200 group ${
              hasNext
                ? 'bg-black/60 hover:bg-black/90 border-white/20 hover:border-white/40 text-white hover:scale-110 shadow-2xl cursor-pointer'
                : 'opacity-0 pointer-events-none'
            }`}
            title={nextItem ? `다음: ${nextItem.name}` : ''}
          >
            <ChevronRight className="w-6 h-6 transform group-hover:translate-x-0.5 transition-transform" />
          </button>
        </>
      )}

      {/* Media Center Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden relative">
        {item.mediaType === 'image' && (
          <img
            src={streamUrl}
            alt={item.name}
            className="max-h-[82vh] max-w-[90vw] object-contain rounded-lg shadow-2xl animate-scaleUp"
          />
        )}

        {item.mediaType === 'video' && (
          <div className="flex flex-col items-center max-w-4xl w-full gap-3">
            {/* Compatibility Warning Banner */}
            {inspection && inspection.needsConversion && (
              <div className="w-full bg-amber-500/15 border border-amber-500/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-200 animate-fadeIn shadow-lg">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-semibold text-amber-300">웹 브라우저 호환성 안내</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-6">
                    {inspection.reasons && inspection.reasons.length > 0 ? (
                      inspection.reasons.map((r, idx) => (
                        <span key={idx} className="px-2.5 py-0.5 rounded-full bg-black/40 border border-amber-500/30 text-[11px] text-amber-200 font-medium">
                          {r}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-amber-200">{inspection.reason}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowConvertModal(true)}
                  className="shrink-0 self-start sm:self-center flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition shadow-md"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  웹 호환 변환하기
                </button>
              </div>
            )}

            {/* Active Conversion Progress Banner */}
            {activeJob && (
              <div className="w-full bg-cyan-950/80 border border-cyan-500/40 rounded-xl p-3 text-xs text-cyan-200 animate-fadeIn">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {activeJob.status === 'running' && <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />}
                    <span className="font-semibold text-cyan-300">
                      {activeJob.status === 'running' ? '⚡ 웹 최적화 변환 진행 중...' : activeJob.status === 'completed' ? '✅ 변환 완료!' : '❌ 변환 실패'}
                    </span>
                    <span className="text-gray-400 text-[11px] truncate max-w-xs font-mono">({activeJob.currentFile})</span>
                  </div>
                  <span className="font-mono font-bold text-cyan-400">
                    {activeJob.processedFiles} / {activeJob.totalFiles} ({activeJob.percent}%)
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-cyan-400 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${activeJob.percent}%` }}
                  ></div>
                </div>
                {activeJob.status === 'completed' && (
                  <p className="text-[11px] text-emerald-400 mt-1.5">
                    모든 영상의 오디오/자막 변환이 완료되었습니다. 창을 다시 열거나 바로 재생하실 수 있습니다.
                  </p>
                )}
              </div>
            )}

            {/* Video Player */}
            <div className="w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10">
              <video
                ref={videoRef}
                key={item.path}
                crossOrigin="anonymous"
                src={streamUrl}
                controls
                autoPlay
                playsInline
                onLoadedMetadata={handleVideoLoaded}
                onEnded={handleVideoEnded}
                className="w-full max-h-[68vh]"
              >
                {subtitles.map((sub) => (
                  <track
                    key={sub.url}
                    src={sub.url}
                    kind="subtitles"
                    srcLang={sub.language}
                    label={sub.label}
                  />
                ))}
                브라우저가 동영상 재생을 지원하지 않습니다.
              </video>
            </div>

            {/* Interactive Subtitle Control Bar */}
            {subtitles.length > 0 && (
              <div className="flex flex-wrap items-center justify-between w-full px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-xs text-gray-200 gap-2 shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-cyan-300 font-semibold mr-1">
                    <SubtitlesIcon className="w-4 h-4 text-cyan-400" />
                    <span>자막 트랙:</span>
                  </div>

                  {/* Subtitle Off */}
                  <button
                    onClick={() => selectSubtitle(null)}
                    className={`px-2.5 py-1 rounded-lg border text-xs transition ${
                      selectedSubtitleUrl === null
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    자막 끄기
                  </button>

                  {/* Quick Korean Subtitle Buttons */}
                  {koSubs.map((sub) => (
                    <button
                      key={sub.url}
                      onClick={() => selectSubtitle(sub.url)}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition flex items-center gap-1.5 ${
                        selectedSubtitleUrl === sub.url
                          ? 'bg-cyan-500/30 border-cyan-400 text-white font-bold shadow-sm'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span>🇰🇷 {sub.label}</span>
                      <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-black/40 text-cyan-300">
                        {sub.format}
                      </span>
                    </button>
                  ))}

                  {/* English quick button */}
                  {enSub && (
                    <button
                      onClick={() => selectSubtitle(enSub.url)}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition ${
                        selectedSubtitleUrl === enSub.url
                          ? 'bg-cyan-500/30 border-cyan-400 text-white font-bold'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      🇺🇸 English
                    </button>
                  )}

                  {/* Japanese quick button */}
                  {jaSub && (
                    <button
                      onClick={() => selectSubtitle(jaSub.url)}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition ${
                        selectedSubtitleUrl === jaSub.url
                          ? 'bg-cyan-500/30 border-cyan-400 text-white font-bold'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      🇯🇵 日本語
                    </button>
                  )}

                  {/* Other subtitles dropdown */}
                  {otherSubs.length > 0 && (
                    <select
                      value={selectedSubtitleUrl && otherSubs.some(s => s.url === selectedSubtitleUrl) ? selectedSubtitleUrl : ''}
                      onChange={(e) => selectSubtitle(e.target.value || null)}
                      className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/20 text-gray-300 hover:text-white text-xs focus:outline-none focus:border-cyan-400"
                    >
                      <option value="">🌐 기타 언어 ({otherSubs.length}개)...</option>
                      {otherSubs.map((sub) => (
                        <option key={sub.url} value={sub.url}>
                          {sub.label} ({sub.format.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="text-[11px] text-gray-400">
                  총 {subtitles.length}개 자막 감지됨 (WebVTT 자동 변환)
                </div>
              </div>
            )}
          </div>
        )}

        {item.mediaType === 'audio' && (
          <div className="flex flex-col items-center gap-6 p-8 bg-white/5 rounded-2xl border border-white/10 shadow-2xl max-w-md w-full">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Music className="w-12 h-12 text-white" />
            </div>
            <div className="text-center">
              <h4 className="text-white font-bold text-base truncate max-w-xs">{item.name}</h4>
              <p className="text-xs text-gray-400 mt-1">{formatBytes(item.size)}</p>
            </div>
            <audio src={streamUrl} controls autoPlay className="w-full" onEnded={handleVideoEnded} />
          </div>
        )}

        {item.mediaType === 'text' && (
          <div className="w-full max-w-4xl h-[78vh] bg-[#16161f] border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-2xl">
            <div className="px-4 py-2 bg-white/5 border-b border-white/10 text-xs text-gray-400 font-mono flex items-center justify-between">
              <span>{item.name}</span>
              <span>{loadingText ? '불러오는 중...' : `${textContent?.length || 0} characters`}</span>
            </div>
            <div className="flex-1 p-4 overflow-auto font-mono text-xs text-gray-200 whitespace-pre-wrap leading-relaxed select-text">
              {loadingText ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 텍스트 파일을 불러오고 있습니다...
                </div>
              ) : (
                textContent
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Footer Info Bar */}
      <div className="h-10 px-6 flex items-center justify-between border-t border-white/10 bg-black/40 text-[11px] text-gray-400">
        <div>
          <span>경로: {item.path}</span>
        </div>
        <div className="flex items-center gap-4">
          {playlist.length > 1 && (
            <span className="hidden sm:inline text-gray-400">
              단축키: 이전 (<kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-gray-200">←</kbd>) / 다음 (<kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-gray-200">→</kbd>) / 재생 (<kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-gray-200">Space</kbd>)
            </span>
          )}
          <span>닫기: <kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono text-gray-200">ESC</kbd></span>
        </div>
      </div>

      {/* Batch Conversion Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1b1b24] border border-white/15 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">웹 호환 고속 변환</h3>
              </div>
              <button
                onClick={() => setShowConvertModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <p className="text-gray-300 leading-relaxed">
                현재 브라우저에서 재생이 원활하지 않은 오디오(EAC3 등)를 <strong>무손실 비디오 복사 + AAC 고속 변환</strong>하여 브라우저에서 버퍼링 없이 즉시 재생되도록 변환합니다.
              </p>

              {/* Conversion Scope */}
              <div className="space-y-2">
                <label className="font-semibold text-gray-200">변환 대상</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConvertTarget('folder')}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition ${
                      convertTarget === 'folder'
                        ? 'bg-amber-500/15 border-amber-500/60 text-white'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    <FolderSync className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium block text-white">폴더 전체 일괄</span>
                      <span className="text-[11px] text-gray-400">현재 폴더 내 모든 영상</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setConvertTarget('single')}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition ${
                      convertTarget === 'single'
                        ? 'bg-amber-500/15 border-amber-500/60 text-white'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    <Play className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium block text-white">현재 파일만</span>
                      <span className="text-[11px] text-gray-400">선택한 영상 1편</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Conversion Options */}
              <div className="space-y-2.5 p-3.5 bg-white/5 rounded-xl border border-white/10">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extractSubtitles}
                    onChange={(e) => setExtractSubtitles(e.target.checked)}
                    className="rounded bg-black/40 border-white/20 text-amber-500 focus:ring-0"
                  />
                  <span>
                    <strong className="text-white block font-medium">한국어 내장 자막 자동 추출</strong>
                    <span className="text-[11px] text-gray-400">MKV 속 한국어 자막을 .ko.srt 파일로 분리</span>
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={convertAudio}
                    onChange={(e) => setConvertAudio(e.target.checked)}
                    className="rounded bg-black/40 border-white/20 text-amber-500 focus:ring-0"
                  />
                  <span>
                    <strong className="text-white block font-medium">오디오 AAC 변환 (EAC3 ➔ AAC)</strong>
                    <span className="text-[11px] text-gray-400">비디오는 그대로 복사(무손실), 소리만 표준 변환</span>
                  </span>
                </label>
              </div>

              {/* Save Mode */}
              <div className="space-y-2">
                <label className="font-semibold text-gray-200">저장 방식</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReplaceOriginal(true)}
                    className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition ${
                      replaceOriginal
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    원본 대체 (용량 절약)
                  </button>
                  <button
                    onClick={() => setReplaceOriginal(false)}
                    className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition ${
                      !replaceOriginal
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    _web.mp4 생성 (원본 보존)
                  </button>
                </div>
              </div>

              {!capabilities?.available && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-[11px]">
                  ⚠️ 미디어 헬퍼(tools/ffmpeg)를 확인하는 중입니다. 잠시 후 다시 시도하거나 서버를 재시작해 주세요.
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowConvertModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-medium transition"
              >
                취소
              </button>
              <button
                onClick={startConversion}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
              >
                <Sparkles className="w-3.5 h-3.5" />
                변환 시작하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
