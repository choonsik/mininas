import React, { useState, useRef, useEffect } from 'react';
import { 
  HardDrive, 
  Activity, 
  LayoutGrid, 
  List, 
  RefreshCw, 
  Search,
  Server,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  Menu,
  Palette
} from 'lucide-react';
import { SystemStats, StorageInfo, SortField, SortOrder, NavTab, ThemeMode } from '../types';
import { formatBytes } from '../utils/format';
import { APP_VERSION } from '../version';

interface HeaderProps {
  stats: SystemStats | null;
  activeStorage: StorageInfo | null;
  activeTab: NavTab;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (m: 'grid' | 'list') => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
  onToggleSidebar?: () => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  activeStorage,
  activeTab,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  isRefreshing,
  sortField,
  sortOrder,
  onSortChange,
  onToggleSidebar,
  theme,
  onThemeChange,
}) => {
  const disk = activeStorage ? activeStorage.disk : stats?.disk;
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setIsThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sortOptions: { id: SortField; label: string }[] = [
    { id: 'name', label: '이름순' },
    { id: 'date', label: '수정일순' },
    { id: 'size', label: '크기순' },
    { id: 'type', label: '종류순' },
  ];

  const themeOptions: { id: ThemeMode; label: string; desc: string }[] = [
    { id: 'macos', label: 'macOS Native', desc: 'Apple 데스크톱 유틸리티' },
    { id: 'console', label: 'Hardware Console', desc: '산업용 계측기 콘솔' },
    { id: 'studio', label: 'Studio Minimal', desc: '흑백 초미니멀' },
  ];

  return (
    <header className="h-14 border-b border-surface-border bg-surface-header px-4 sm:px-5 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Brand & System Title */}
      <div className="flex items-center gap-3 shrink-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-1.5 -ml-1 text-content-secondary hover:text-content-primary md:hidden rounded hover:bg-surface-cardHover transition"
            title="사이드바 열기"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-surface-card border border-surface-border flex items-center justify-center text-content-primary shrink-0">
            <Server className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm text-content-primary tracking-tight">MiniNAS</span>
            <span className="text-[11px] font-mono text-content-muted">v{APP_VERSION}</span>
          </div>
        </div>
      </div>

      {/* Center: Search input */}
      <div className="flex-1 max-w-md mx-4 min-w-0">
        {activeTab === 'files' ? (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="파일 필터 및 검색..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-surface-base border border-surface-border focus:border-accent rounded pl-8 pr-3 py-1 text-xs text-content-primary placeholder-content-muted focus:outline-none transition"
            />
          </div>
        ) : (
          <div className="text-center">
            <span className="text-xs font-medium text-content-secondary">
              {activeTab === 'cinema' && '시네마'}
              {activeTab === 'photos' && '사진 및 비디오'}
              {activeTab === 'sites' && '웹 사이트'}
              {activeTab === 'trash' && '휴지통'}
            </span>
          </div>
        )}
      </div>

      {/* Right: Stats, Theme & View controls */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Hardware Status Chips */}
        {stats && (
          <div className="hidden lg:flex items-center gap-3 text-[11px] text-content-secondary px-2.5 py-1 rounded bg-surface-base border border-surface-borderSubtle">
            {disk && (
              <div className="flex items-center gap-1.5" title={`저장소: ${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}`}>
                <HardDrive className="w-3 h-3 text-content-muted" />
                <span className="font-mono">{disk.usedPercent.toFixed(0)}%</span>
              </div>
            )}
            <div className="w-px h-3 bg-surface-border" />
            <div className="flex items-center gap-1.5" title={`RAM: ${formatBytes(stats.memory.usedBytes)} / ${formatBytes(stats.memory.totalBytes)}`}>
              <Activity className="w-3 h-3 text-content-muted" />
              <span className="font-mono">RAM {stats.memory.usedPercent.toFixed(0)}%</span>
            </div>
            <div className="w-px h-3 bg-surface-border" />
            <div className="flex items-center gap-1.5" title="CPU 부하">
              <span className="font-mono">CPU {stats.cpuPercent.toFixed(0)}%</span>
            </div>
          </div>
        )}

        {/* Theme Switcher Dropdown */}
        <div className="relative" ref={themeRef}>
          <button
            onClick={() => setIsThemeOpen(!isThemeOpen)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-content-secondary hover:text-content-primary bg-surface-base hover:bg-surface-cardHover border border-surface-border rounded transition"
            title="테마 스타일 변경"
          >
            <Palette className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline font-medium">
              {theme === 'macos' ? 'macOS' : theme === 'console' ? 'Console' : 'Studio'}
            </span>
          </button>

          {isThemeOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-surface-card border border-surface-border rounded shadow-xl py-1 z-40 text-xs">
              <div className="px-3 py-1 text-[10px] text-content-muted font-medium border-b border-surface-borderSubtle">
                디자인 스타일 선택
              </div>
              {themeOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onThemeChange(opt.id);
                    setIsThemeOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-start justify-between text-content-primary hover:bg-surface-cardHover transition"
                >
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-[10px] text-content-muted">{opt.desc}</div>
                  </div>
                  {theme === opt.id && (
                    <Check className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sorting Dropdown (Only in 'files' mode) */}
        {activeTab === 'files' && (
          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-content-secondary hover:text-content-primary bg-surface-base hover:bg-surface-cardHover border border-surface-border rounded transition"
              title="정렬 기준"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-content-muted" />
              <span className="hidden sm:inline">
                {sortOptions.find(o => o.id === sortField)?.label}
              </span>
              {sortOrder === 'asc' ? (
                <ArrowUp className="w-3 h-3 text-accent" />
              ) : (
                <ArrowDown className="w-3 h-3 text-accent" />
              )}
            </button>

            {isSortOpen && (
              <div className="absolute right-0 mt-1 w-32 bg-surface-card border border-surface-border rounded shadow-lg py-1 z-40 text-xs">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onSortChange(opt.id);
                      setIsSortOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between text-content-primary hover:bg-surface-cardHover transition"
                  >
                    <span>{opt.label}</span>
                    {sortField === opt.id && (
                      <Check className="w-3 h-3 text-accent" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* View mode toggle (Only in 'files' mode) */}
        {activeTab === 'files' && (
          <div className="flex items-center bg-surface-base border border-surface-border rounded p-0.5">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-1 rounded transition ${viewMode === 'grid' ? 'bg-surface-cardHover text-content-primary' : 'text-content-muted hover:text-content-primary'}`}
              title="아이콘 보기"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`p-1 rounded transition ${viewMode === 'list' ? 'bg-surface-cardHover text-content-primary' : 'text-content-muted hover:text-content-primary'}`}
              title="목록 보기"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-cardHover rounded transition disabled:opacity-40"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-accent' : ''}`} />
        </button>
      </div>
    </header>
  );
};
