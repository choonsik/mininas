import React from 'react';
import { 
  Folder, 
  Image as ImageIcon, 
  Film, 
  Globe, 
  HardDrive,
  X,
  Trash2,
  Server,
  Music,
  Palette
} from 'lucide-react';
import { SystemStats, StorageInfo, NavTab, ThemeStyle, ThemeTone, FontSizeMode } from '../types';
import { formatBytes } from '../utils/format';

interface SidebarProps {
  storages: StorageInfo[];
  activeStorageId: string;
  onSelectStorage: (id: string) => void;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  stats: SystemStats | null;
  onCloseMobile?: () => void;
  themeStyle?: ThemeStyle;
  onSelectThemeStyle?: (style: ThemeStyle) => void;
  themeTone?: ThemeTone;
  onSelectThemeTone?: (tone: ThemeTone) => void;
  fontSize?: FontSizeMode;
  onFontSizeChange?: (size: FontSizeMode) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  storages,
  activeStorageId,
  onSelectStorage,
  activeTab,
  onSelectTab,
  stats,
  onCloseMobile,
  themeStyle,
  onSelectThemeStyle,
  themeTone,
  onSelectThemeTone,
  fontSize,
  onFontSizeChange,
}) => {
  const hubItems: { id: NavTab; label: string; icon: React.ElementType }[] = [
    { id: 'cinema', label: '시네마', icon: Film },
    { id: 'photos', label: '포토 & 앨범', icon: ImageIcon },
    { id: 'music', label: '음악', icon: Music },
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
    <aside className="w-64 border-r border-surface-border bg-surface-sidebar flex flex-col p-3 select-none overflow-y-auto h-full shrink-0 overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="space-y-4 pb-3">
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

        {/* 4. Theme & Appearance (Particularly for Mobile) */}
        {themeStyle && onSelectThemeStyle && (
          <div>
            <span className="text-[11px] font-medium text-content-muted px-2 block mb-1.5 flex items-center gap-1.5">
              <Palette className="w-3 h-3 text-content-muted" />
              <span>외형 및 스타일</span>
            </span>
            <div className="space-y-1.5 px-0.5">
              {/* Theme Style Tabs */}
              <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-surface-base border border-surface-border">
                {(
                  [
                    { id: 'macos', label: 'macOS' },
                    { id: 'console', label: 'Console' },
                    { id: 'studio', label: 'Studio' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => onSelectThemeStyle(opt.id)}
                    className={`py-1 text-[11px] font-medium rounded transition ${
                      themeStyle === opt.id
                        ? 'bg-surface-card text-content-primary shadow-xs'
                        : 'text-content-muted hover:text-content-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Tone Tabs */}
              {themeTone && onSelectThemeTone && (
                <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-surface-base border border-surface-border">
                  {(
                    [
                      { id: 'dark', label: '다크' },
                      { id: 'night', label: '나이트' },
                      { id: 'light', label: '라이트' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onSelectThemeTone(t.id)}
                      className={`py-1 text-[11px] font-medium rounded transition ${
                        themeTone === t.id
                          ? 'bg-surface-card text-content-primary shadow-xs'
                          : 'text-content-muted hover:text-content-secondary'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Font Size Tabs */}
              {fontSize && onFontSizeChange && (
                <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-surface-base border border-surface-border">
                  {(
                    [
                      { id: 'small', label: '작게' },
                      { id: 'medium', label: '보통' },
                      { id: 'large', label: '크게' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onFontSizeChange(f.id)}
                      className={`py-1 text-[11px] font-medium rounded transition ${
                        fontSize === f.id
                          ? 'bg-surface-card text-content-primary shadow-xs'
                          : 'text-content-muted hover:text-content-secondary'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Clean, quiet System Info footer */}
      {stats && (
        <div className="mt-auto pt-3 border-t border-surface-border text-[11px] text-content-muted space-y-1.5 shrink-0">
          <div className="flex items-center justify-between">
            <span>호스트</span>
            <span className="font-mono text-content-secondary truncate max-w-[120px]">{stats.hostname}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>CPU</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-content-secondary">{stats.cpuPercent.toFixed(0)}%</span>
              <div className="w-12 h-1 bg-surface-borderSubtle rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${stats.cpuPercent > 80 ? 'bg-red-500' : 'bg-accent'}`}
                  style={{ width: `${Math.min(stats.cpuPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>
          {stats.memory && (
            <div className="flex items-center justify-between">
              <span>메모리</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-content-secondary">{stats.memory.usedPercent.toFixed(0)}%</span>
                <div className="w-12 h-1 bg-surface-borderSubtle rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${stats.memory.usedPercent > 85 ? 'bg-red-500' : 'bg-accent'}`}
                    style={{ width: `${Math.min(stats.memory.usedPercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
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
