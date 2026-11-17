import React from 'react';
import { 
  Folder, 
  Image as ImageIcon, 
  Film, 
  Globe, 
  HardDrive,
  X,
  Trash2,
  Server
} from 'lucide-react';
import { SystemStats, StorageInfo, NavTab } from '../types';
import { formatBytes } from '../utils/format';

interface SidebarProps {
  storages: StorageInfo[];
  activeStorageId: string;
  onSelectStorage: (id: string) => void;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  stats: SystemStats | null;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  storages,
  activeStorageId,
  onSelectStorage,
  activeTab,
  onSelectTab,
  stats,
  onCloseMobile,
}) => {
  const hubItems: { id: NavTab; label: string; icon: React.ElementType }[] = [
    { id: 'cinema', label: '시네마', icon: Film },
    { id: 'photos', label: '포토 & 앨범', icon: ImageIcon },
    { id: 'sites', label: '웹 사이트', icon: Globe },
  ];

  const formatUptime = (sec: number) => {
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (days > 0) return `${days}일 ${hours}시간`;
    return `${hours}시간 ${mins}분`;
  };

  return (
    <aside className="w-64 border-r border-surface-border bg-surface-sidebar flex flex-col justify-between p-3 select-none overflow-y-auto h-full shrink-0">
      <div className="space-y-5">
        {/* Mobile Header with Close button */}
        {onCloseMobile && (
          <div className="flex md:hidden items-center justify-between pb-2 border-b border-surface-border">
            <span className="font-medium text-xs text-content-primary">내비게이션</span>
            <button
              onClick={onCloseMobile}
              className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface-cardHover transition"
              title="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 1. Storages (Locations) */}
        <div>
          <span className="text-[11px] font-medium text-content-muted px-2 block mb-1.5">
            저장소
          </span>
          <nav className="space-y-1">
            {storages.map((storage) => {
              const isActive = activeTab === 'files' && activeStorageId === storage.id;
              return (
                <button
                  key={storage.id}
                  onClick={() => {
                    onSelectTab('files');
                    onSelectStorage(storage.id);
                    onCloseMobile?.();
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-md transition text-xs ${
                    isActive
                      ? 'bg-surface-card border border-surface-border text-content-primary shadow-sm font-medium'
                      : 'text-content-secondary hover:bg-surface-cardHover hover:text-content-primary'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <HardDrive className={`w-3.5 h-3.5 ${isActive ? 'text-accent' : 'text-content-muted'}`} />
                      <span className="truncate">{storage.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-content-muted ml-2 shrink-0">
                      {formatBytes(storage.disk.freeBytes)} 남음
                    </span>
                  </div>

                  {/* Slim gauge */}
                  <div className="w-full h-1 bg-surface-borderSubtle rounded-full overflow-hidden mt-1.5">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${storage.disk.usedPercent > 85 ? 'bg-red-500' : 'bg-accent'}`}
                      style={{ width: `${Math.min(storage.disk.usedPercent, 100)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* 2. Media Hubs */}
        <div>
          <span className="text-[11px] font-medium text-content-muted px-2 block mb-1.5">
            미디어
          </span>
          <nav className="space-y-0.5">
            {hubItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile?.();
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs transition ${
                    isActive
                      ? 'bg-surface-card border border-surface-border text-content-primary font-medium'
                      : 'text-content-secondary hover:bg-surface-cardHover hover:text-content-primary'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-accent' : 'text-content-muted'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* 3. System & Management */}
        <div>
          <span className="text-[11px] font-medium text-content-muted px-2 block mb-1.5">
            시스템
          </span>
          <nav className="space-y-0.5">
            <button
              onClick={() => {
                onSelectTab('trash');
                onCloseMobile?.();
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs transition ${
                activeTab === 'trash'
                  ? 'bg-surface-card border border-surface-border text-content-primary font-medium'
                  : 'text-content-secondary hover:bg-surface-cardHover hover:text-content-primary'
              }`}
            >
              <Trash2 className={`w-3.5 h-3.5 ${activeTab === 'trash' ? 'text-accent' : 'text-content-muted'}`} />
              <span>휴지통</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Clean, quiet System Info footer */}
      {stats && (
        <div className="pt-3 border-t border-surface-border text-[11px] text-content-muted space-y-1">
          <div className="flex items-center justify-between">
            <span>호스트</span>
            <span className="font-mono text-content-secondary">{stats.hostname}</span>
          </div>
          {stats.uptimeSeconds > 0 && (
            <div className="flex items-center justify-between">
              <span>가동 시간</span>
              <span className="font-mono text-content-secondary">{formatUptime(stats.uptimeSeconds)}</span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
