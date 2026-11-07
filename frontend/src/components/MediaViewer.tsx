import React, { useEffect, useState, useRef } from 'react';
import { X, Download, Play, Music, FileText, Image as ImageIcon, Globe, Subtitles as SubtitlesIcon, AlertTriangle, Sparkles, RefreshCw, FolderSync } from 'lucide-react';
import { FileItem, SubtitleTrack, MediaInspection, MediaCapabilities, BatchConvertJob } from '../types';
import { api } from '../api';
import { formatBytes, truncateMiddle } from '../utils/format';

interface MediaViewerProps {
  item: FileItem | null;
  storageId?: string;
  onClose: () => void;
}

export const MediaViewer: React.FC<MediaViewerProps> = ({ item, storageId = '', onClose }) => {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleUrl, setSelectedSubtitleUrl] = useState<string | null>(null);
  const [inspection, setInspection] = useState<MediaInspection | null>(null);
  const [capabilities, setCapabilities] = useState<MediaCapabilities | null>(null);

  // Conversion state
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertTarget, setConvertTarget] = useState<'folder' | 'single'>('folder');
  const [replaceOriginal, setReplaceOriginal] = useState(false);
  const [extractSubtitles, setExtractSubtitles] = useState(true);
  const [convertAudio, setConvertAudio] = useState(true);
  const [activeJob, setActiveJob] = useState<BatchConvertJob | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-between animate-fadeIn">
      {/* Top Header */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-white/10 text-white">
            {item.mediaType === 'image' && <ImageIcon className="w-5 h-5 text-emerald-400" />}
            {item.mediaType === 'video' && <Play className="w-5 h-5 text-violet-400" />}
            {item.mediaType === 'audio' && <Music className="w-5 h-5 text-pink-400" />}
            {item.mediaType === 'text' && <FileText className="w-5 h-5 text-amber-400" />}
          </div>
          <div>
            <h3 className="text-white font-medium text-sm truncate max-w-lg" title={item.name}>
              {truncateMiddle(item.name, 60)}
            </h3>
            <span className="text-xs text-gray-400 font-mono">{formatBytes(item.size)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Media Center Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
        {item.mediaType === 'image' && (
          <img
            src={streamUrl}
            alt={item.name}
            className="max-h-[82vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
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
                    <span>자막 선택:</span>
                  </div>

                  {/* 1. 한국어 퀵 버튼 (1개면 한국어, 외장/내장 복수 시 각각 버튼 제공) */}
                  {koSubs.map((sub) => {
                    const isEmbedded = sub.label.includes('내장');
                    const labelText = koSubs.length > 1
                      ? isEmbedded ? '한국어 (내장)' : '한국어 (외장)'
                      : '한국어';
                    return (
                      <button
                        key={sub.url}
                        onClick={() => selectSubtitle(sub.url)}
                        title={sub.label}
                        className={`px-3 py-1 rounded-lg text-xs transition flex items-center gap-1 ${
                          selectedSubtitleUrl === sub.url
                            ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/20'
                            : 'bg-white/10 hover:bg-white/20 text-gray-200'
                        }`}
                      >
                        <span>🇰🇷</span>
                        <span>{labelText}</span>
                      </button>
                    );
                  })}

                  {/* 2. 영어 퀵 버튼 */}
                  {enSub && (
                    <button
                      onClick={() => selectSubtitle(enSub.url)}
                      className={`px-3 py-1 rounded-lg text-xs transition flex items-center gap-1 ${
                        selectedSubtitleUrl === enSub.url
                          ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/20'
                          : 'bg-white/10 hover:bg-white/20 text-gray-200'
                      }`}
                    >
                      <span>🇺🇸</span>
                      <span>English</span>
                    </button>
                  )}

                  {/* 3. 일본어 퀵 버튼 */}
                  {jaSub && (
                    <button
                      onClick={() => selectSubtitle(jaSub.url)}
                      className={`px-3 py-1 rounded-lg text-xs transition flex items-center gap-1 ${
                        selectedSubtitleUrl === jaSub.url
                          ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/20'
                          : 'bg-white/10 hover:bg-white/20 text-gray-200'
                      }`}
                    >
                      <span>🇯🇵</span>
                      <span>日本語</span>
                    </button>
                  )}

                  {/* 4. 기타 언어 드롭다운 */}
                  {otherSubs.length > 0 && (
                    <select
                      value={otherSubs.some((s) => s.url === selectedSubtitleUrl) ? selectedSubtitleUrl || '' : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          selectSubtitle(e.target.value);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#222430] border border-white/20 text-xs text-gray-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
                    >
                      <option value="">🌐 기타 언어 ({otherSubs.length}개)...</option>
                      {otherSubs.map((s) => (
                        <option key={s.url} value={s.url}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 5. 자막 끄기 버튼 */}
                <button
                  onClick={() => selectSubtitle(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition ${
                    selectedSubtitleUrl === null
                      ? 'bg-red-500/30 text-red-300 border border-red-500/40 font-medium'
                      : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  자막 끄기
                </button>
              </div>
            )}
          </div>
        )}

        {item.mediaType === 'audio' && (
          <div className="bg-[#1c1c26] border border-white/10 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-6 max-w-md w-full">
            <div className="w-24 h-24 rounded-full bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400 shadow-inner">
              <Music className="w-12 h-12" />
            </div>
            <div className="text-center">
              <h4 className="text-white font-semibold text-base truncate max-w-xs">{item.name}</h4>
              <p className="text-gray-400 text-xs mt-1">오디오 재생 중</p>
            </div>
            <audio src={streamUrl} controls autoPlay className="w-full" />
          </div>
        )}

        {item.mediaType === 'text' && (
          <div className="w-full max-w-4xl h-[75vh] bg-[#171720] border border-white/10 rounded-xl p-5 overflow-auto shadow-2xl">
            {loadingText ? (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                내용을 불러오는 중...
              </div>
            ) : (
              <pre className="font-mono text-xs text-gray-200 whitespace-pre-wrap leading-relaxed">
                {textContent}
              </pre>
            )}
          </div>
        )}

        {item.mediaType === 'other' && (
          <div className="text-center text-gray-400">
            <p className="text-base font-medium text-gray-200">미리보기를 지원하지 않는 파일 형식입니다</p>
            <p className="text-xs mt-1">상단의 다운로드 버튼을 눌러 컴퓨터에 저장 후 확인하세요.</p>
          </div>
        )}
      </div>

      {/* Batch Conversion Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1c26] border border-white/15 rounded-2xl p-6 max-w-md w-full shadow-2xl text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base">웹 호환 미디어 변환</h3>
                <p className="text-xs text-gray-400">비디오 화질은 100% 보존하며 오디오/자막을 최적화합니다</p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-gray-300">
              {/* Target Scope */}
              <div className="space-y-2">
                <label className="font-semibold text-gray-200">변환 대상 범위</label>
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
                      <span className="text-[11px] text-gray-400">같은 폴더의 모든 영상</span>
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
