import React, { useState, useEffect, useRef } from 'react';
import { 
  Globe, 
  ExternalLink, 
  Copy, 
  Check, 
  FolderOpen, 
  RefreshCw, 
  Search, 
  FileCode, 
  Layers, 
  Calendar, 
  HardDrive, 
  Pin, 
  PinOff 
} from 'lucide-react';
import { StorageInfo, SiteItem } from '../types';
import { api } from '../api';
import { formatBytes } from '../utils/format';

// Dynamic 16:9 Responsive Website Thumbnail (Full Cover with zero black borders)
const SitePreviewThumbnail: React.FC<{ url: string; title: string }> = ({ url, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(0.3);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateScale = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        // Virtual HD resolution: 1280px wide
        setScale(width / 1280);
      }
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={containerRef}
      onClick={() => window.open(url, '_blank')}
      className="relative w-full aspect-video bg-[#0d0d12] rounded-xl overflow-hidden border border-[#252538] mb-3.5 cursor-pointer group/preview shadow-inner flex items-center justify-center"
      title="새 탭에서 사이트 열기"
    >
      <div 
        className="w-[1280px] h-[720px] shrink-0 origin-center pointer-events-none"
        style={{
          transform: `scale(${scale})`,
        }}
      >
        <iframe
          src={url}
          title={title}
          tabIndex={-1}
          loading="lazy"
          scrolling="no"
          className="w-full h-full border-none select-none overflow-hidden"
          style={{ overflow: 'hidden' }}
        />
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
        <span className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xl shadow-emerald-950/70 transform translate-y-1 group-hover/preview:translate-y-0 transition-transform">
          <ExternalLink className="w-3.5 h-3.5" />
          <span>새 탭에서 열기</span>
        </span>
      </div>
    </div>
  );
};

interface SitesHubViewProps {
  storages: StorageInfo[];
  onNavigateToStorage: (storageId: string, path: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SitesHubView: React.FC<SitesHubViewProps> = ({
  storages,
  onNavigateToStorage,
  onShowToast,
}) => {
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchSites = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSites();
      setSites(data);
    } catch (err: any) {
      onShowToast(`사이트 목록 로드 실패: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const handleCopyLink = async (site: SiteItem) => {
    const fullUrl = `${window.location.origin}${site.url}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = fullUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedId(site.id);
      onShowToast(`공유 링크가 복사되었습니다: ${fullUrl}`, 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      onShowToast('링크 복사 실패', 'error');
    }
  };

  const handleUnpin = async (site: SiteItem) => {
    try {
      await api.unpinSite(site.storageId, site.relPath);
      onShowToast(`'${site.title}' 핀 고정이 해제되었습니다.`, 'info');
      fetchSites();
    } catch (err: any) {
      onShowToast(`고정 해제 실패: ${err.message}`, 'error');
    }
  };

  const filteredSites = sites.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.relPath.toLowerCase().includes(q) || s.storageName.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6">
      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>호스팅 중인 사이트 & 보고서</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
              {sites.length}개
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="제목, 파일명, 경로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#181822] border border-[#292938] rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 transition"
            />
          </div>

          <button
            onClick={fetchSites}
            disabled={isLoading}
            className="p-2 bg-[#181824] hover:bg-[#222232] border border-[#262638] rounded-xl text-gray-400 hover:text-white transition disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sites Card Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-[#15151e] border border-[#232330] rounded-2xl">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm text-gray-300">호스팅 사이트 및 핀 목록 로드 중...</p>
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-[#15151e] border border-[#232330] rounded-2xl text-center">
          <FileCode className="w-10 h-10 text-gray-500" />
          <h4 className="text-base font-bold text-gray-200">
            {searchQuery ? '검색 결과와 일치하는 사이트가 없습니다.' : '등록된 웹사이트나 보고서가 없습니다.'}
          </h4>
          <p className="text-xs text-gray-400 max-w-md">
            저장소의 <span className="font-mono text-emerald-400">htdocs/</span> 또는 <span className="font-mono text-emerald-400">sites/</span> 폴더에 프로젝트를 넣거나, 
            파일 탐색기에서 원하는 폴더/HTML 우클릭 후 <b>[🌐 사이트 허브에 고정]</b>을 눌러보세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-5 sm:gap-6">
          {filteredSites.map((site) => {
            const folderPath = site.isDir ? site.relPath : (site.relPath.substring(0, site.relPath.lastIndexOf('/')) || '/');
            const isCopied = copiedId === site.id;

            return (
              <div
                key={site.id}
                className="bg-[#171722] border border-[#262638] hover:border-emerald-500/40 rounded-2xl p-4 transition flex flex-col justify-between group shadow-sm hover:shadow-xl hover:shadow-emerald-950/20"
              >
                <div>
                  {/* Clean Responsive Live Thumbnail Preview (16:9 Full Aspect) */}
                  <SitePreviewThumbnail url={site.url} title={site.title} />

                  {/* Badges */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 truncate max-w-[140px]">
                      <HardDrive className="w-3 h-3 shrink-0" />
                      <span className="truncate">{site.storageName}</span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      {site.isPinned && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border bg-amber-500/10 text-amber-300 border-amber-500/20 flex items-center gap-1">
                          <Pin className="w-3 h-3 text-amber-400" />
                          <span>고정됨</span>
                        </span>
                      )}

                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                        site.isDir 
                          ? (site.hasIndex ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-purple-500/10 text-purple-300 border-purple-500/20')
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        {site.isDir ? <Layers className="w-3 h-3" /> : <FileCode className="w-3 h-3" />}
                        <span>{site.isDir ? (site.hasIndex ? '웹 프로젝트' : '문서 아카이브') : '단일 HTML'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Title (Clickable link) */}
                  <h4 
                    onClick={() => window.open(site.url, '_blank')}
                    className="text-base font-bold text-white hover:text-emerald-400 cursor-pointer transition line-clamp-1 leading-snug flex items-center justify-between group/title"
                    title="새 탭에서 열기"
                  >
                    <span className="truncate">{site.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover/title:text-emerald-400 shrink-0 ml-1.5 opacity-0 group-hover/title:opacity-100 transition" />
                  </h4>

                  <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-2 font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-gray-500" />
                      {new Date(site.modTime).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span>{formatBytes(site.size)}</span>
                  </div>
                </div>

                {/* Card Actions (Streamlined for Mobile & Desktop) */}
                <div className="mt-3.5 pt-3 border-t border-[#222230] flex items-center justify-between gap-2">
                  <button
                    onClick={() => onNavigateToStorage(site.storageId, folderPath)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-[#222232] rounded-lg transition"
                    title="해당 파일이 있는 폴더 열기"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">폴더 열기</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {site.isPinned && (
                      <button
                        onClick={() => handleUnpin(site)}
                        className="flex items-center gap-1 px-2 py-1.5 text-xs text-amber-400 hover:text-red-400 hover:bg-[#222232] rounded-lg transition"
                        title="핀 고정 해제"
                      >
                        <PinOff className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">고정 해제</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleCopyLink(site)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                        isCopied 
                          ? 'bg-emerald-500/20 text-emerald-300' 
                          : 'text-gray-400 hover:text-white hover:bg-[#222232]'
                      }`}
                      title="공유 링크 복사"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? '복사됨!' : '링크 복사'}</span>
                    </button>

                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-emerald-400 hover:text-white hover:bg-emerald-600/30 border border-emerald-500/30 rounded-lg transition"
                      title="새 탭에서 사이트 열기"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
