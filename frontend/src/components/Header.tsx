import React, { useState, useRef, useEffect } from 'react';
import { 
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
  ChevronLeft,
  X
} from 'lucide-react';
import { SortField, SortOrder, NavTab } from '../types';
import { APP_VERSION } from '../version';

interface HeaderProps {
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
}

export const Header: React.FC<HeaderProps> = ({
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
}) => {
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
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

  return (
    <header className="h-14 border-b border-surface-border bg-surface-header px-2.5 sm:px-5 flex items-center justify-between sticky top-0 z-30 select-none pt-[env(safe-area-inset-top,0px)]">
      {isMobileSearchOpen ? (
        /* Mobile Full-Width Search Bar */
        <div className="flex-1 flex items-center gap-2 py-1 w-full animate-fadeIn">
          <button
            onClick={() => {
              setIsMobileSearchOpen(false);
              onSearchChange('');
            }}
            className="p-1.5 -ml-1 text-content-secondary hover:text-content-primary rounded touch-manipulation active:scale-[0.95]"
            title="검색 닫기"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 relative">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              autoFocus
              type="text"
              placeholder="파일명 필터 및 검색..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-surface-base border border-accent rounded pl-8 pr-7 py-1.5 text-xs text-content-primary placeholder-content-muted focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setIsMobileSearchOpen(false)}
            className="text-xs text-accent font-medium px-2 py-1 rounded shrink-0 touch-manipulation active:scale-[0.95]"
          >
            완료
          </button>
        </div>
      ) : (
        <>
          {/* Brand & System Title */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="p-1.5 -ml-1 text-content-secondary hover:text-content-primary md:hidden rounded hover:bg-surface-cardHover transition touch-manipulation active:scale-[0.95]"
                title="사이드바 열기"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-surface-card border border-surface-border flex items-center justify-center text-content-primary shrink-0">
                <Server className="w-3.5 h-3.5 text-accent" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-sm text-content-primary tracking-tight">MiniNAS</span>
                <span className="text-[11px] font-mono text-content-muted">{APP_VERSION}</span>
              </div>
            </div>
          </div>

          {/* Center: Search input (Files mode only, Desktop only) */}
          <div className="hidden md:flex flex-1 max-w-md mx-4 min-w-0">
            {activeTab === 'files' && (
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="파일 필터 및 검색..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="w-full bg-surface-base border border-surface-border focus:border-accent rounded pl-8 pr-3 py-1 text-xs text-content-primary placeholder-content-muted focus:outline-none transition"
                />
              </div>
            )}
          </div>

          {/* Right: Stats, Theme & View controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Mobile Search Button (Only in files mode) */}
            {activeTab === 'files' && (
              <button
                onClick={() => setIsMobileSearchOpen(true)}
                className={`p-1.5 md:hidden rounded transition touch-manipulation active:scale-[0.95] ${
                  searchQuery ? 'bg-accent/20 text-accent font-semibold' : 'text-content-secondary hover:text-content-primary hover:bg-surface-cardHover'
                }`}
                title="파일 검색"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
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
              className={`p-1.5 sm:p-1 rounded transition touch-manipulation active:scale-[0.95] ${viewMode === 'grid' ? 'bg-surface-cardHover text-content-primary' : 'text-content-muted hover:text-content-primary'}`}
              title="아이콘 보기"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`p-1.5 sm:p-1 rounded transition touch-manipulation active:scale-[0.95] ${viewMode === 'list' ? 'bg-surface-cardHover text-content-primary' : 'text-content-muted hover:text-content-primary'}`}
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
          className="p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-cardHover rounded transition disabled:opacity-40 touch-manipulation active:scale-[0.95]"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-accent' : ''}`} />
        </button>
      </div>
      </>
      )}
    </header>
  );
};
