import React, { useState, useEffect, useRef } from 'react';
import { 
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

const SitePreviewThumbnail: React.FC<{ url: string; title: string }> = ({ url, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(0.3);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateScale = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
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
      className="relative w-full aspect-video bg-surface-base rounded-md overflow-hidden border border-surface-border mb-3 cursor-pointer group/preview flex items-center justify-center"
      title="새 탭에서 사이트 열기"
    >
      <div 
        className="w-[1280px] h-[720px] shrink-0 origin-center pointer-events-none overflow-hidden relative"
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
          onLoad={(e) => {
            try {
              const doc = e.currentTarget.contentDocument;
              if (doc) {
                const style = doc.createElement('style');
                style.textContent = `
                  html, body {
                    overflow: hidden !important;
                    scrollbar-width: none !important;
                    -ms-overflow-style: none !important;
                  }
                  ::-webkit-scrollbar {
                    display: none !important;
                    width: 0 !important;
                    height: 0 !important;
                  }
                `;
                doc.head.appendChild(style);
              }
            } catch {}
          }}
          className="w-[1330px] h-[750px] border-none select-none"
          style={{ 
            overflow: 'hidden',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        />
      </div>

      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
        <span className="px-3 py-1 rounded bg-surface-card border border-surface-border text-content-primary text-xs font-medium flex items-center gap-1.5 shadow">
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
  onNavigateToStorage,
  onShowToast,
}) => {
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchSites = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSites();
      setSites(data || []);
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
    const fullUrl = window.location.origin + site.url;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = fullUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
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
    <div className="flex-1 overflow-y-auto p-2.5 sm:p-6 space-y-4 text-content-primary overscroll-y-contain">
      {/* Search & Header Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-content-primary">
            웹 사이트 쇼케이스
          </h3>
          <span className="text-[11px] font-mono text-content-muted">
            ({sites.length}개)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-card border border-surface-border rounded-md pl-8 pr-3 py-1 text-xs text-content-primary placeholder-content-muted focus:outline-none focus:border-accent transition"
            />
          </div>

          <button
            onClick={fetchSites}
            disabled={isLoading}
            className="p-1.5 bg-surface-card hover:bg-surface-cardHover border border-surface-border rounded-md text-content-muted hover:text-content-primary transition disabled:opacity-40"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sites Card Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-2 text-content-muted">
          <RefreshCw className="w-5 h-5 text-accent animate-spin" />
          <p className="text-xs">사이트 목록 불러오는 중...</p>
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-2 text-center text-content-muted">
          <FileCode className="w-8 h-8 opacity-40 mb-1" />
          <h4 className="text-xs font-medium text-content-secondary">
            {searchQuery ? '검색 결과가 없습니다' : '등록된 사이트가 없습니다'}
          </h4>
          <p className="text-[11px] max-w-sm">
            저장소의 htdocs/ 또는 sites/ 폴더에 넣거나 파일 탐색기에서 [사이트 허브에 고정]을 선택하세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {filteredSites.map((site) => {
            const folderPath = site.isDir ? site.relPath : (site.relPath.substring(0, site.relPath.lastIndexOf('/')) || '/');
            const isCopied = copiedId === site.id;

            return (
              <div
                key={site.id}
                className="bg-surface-card border border-surface-border rounded-lg p-3 transition flex flex-col justify-between hover:border-accent/40"
              >
                <div>
                  <SitePreviewThumbnail url={site.url} title={site.title} />

                  <div className="flex items-center justify-between gap-2 mb-1.5 text-[11px]">
                    <span className="text-content-muted flex items-center gap-1 truncate font-mono">
                      <HardDrive className="w-3 h-3 shrink-0" />
                      <span className="truncate">{site.storageName}</span>
                    </span>

                    <div className="flex items-center gap-1">
                      {site.isPinned && (
                        <span className="text-[10px] px-1 rounded bg-amber-500/10 text-amber-300 flex items-center gap-0.5">
                          <Pin className="w-2.5 h-2.5" />
                          <span>고정</span>
                        </span>
                      )}

                      <span className="text-[10px] text-content-muted flex items-center gap-0.5">
                        {site.isDir ? <Layers className="w-2.5 h-2.5" /> : <FileCode className="w-2.5 h-2.5" />}
                        <span>{site.isDir ? (site.hasIndex ? '웹 프로젝트' : '아카이브') : 'HTML'}</span>
                      </span>
                    </div>
                  </div>

                  <h4 
                    onClick={() => window.open(site.url, '_blank')}
                    className="text-xs font-semibold text-content-primary hover:text-accent cursor-pointer transition truncate"
                    title="새 탭에서 열기"
                  >
                    {site.title}
                  </h4>

                  <div className="flex items-center gap-2 text-[10px] text-content-muted mt-1 font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />
                      {new Date(site.modTime).toLocaleDateString()}
                    </span>
                    <span>•</span>
                    <span>{formatBytes(site.size)}</span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-surface-border flex items-center justify-between gap-1 text-xs">
                  <button
                    onClick={() => onNavigateToStorage(site.storageId, folderPath)}
                    className="flex items-center gap-1 text-[11px] text-content-muted hover:text-content-primary transition"
                    title="폴더 열기"
                  >
                    <FolderOpen className="w-3 h-3" />
                    <span>폴더 열기</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {site.isPinned && (
                      <button
                        onClick={() => handleUnpin(site)}
                        className="p-1 text-content-muted hover:text-red-400 transition"
                        title="핀 고정 해제"
                      >
                        <PinOff className="w-3 h-3" />
                      </button>
                    )}

                    <button
                      onClick={() => handleCopyLink(site)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-content-secondary hover:text-content-primary transition"
                      title="링크 복사"
                    >
                      {isCopied ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3" />}
                      <span>{isCopied ? '복사됨' : '복사'}</span>
                    </button>

                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-content-muted hover:text-accent transition"
                      title="새 탭에서 열기"
                    >
                      <ExternalLink className="w-3 h-3" />
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
