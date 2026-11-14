import React, { useState, useRef, useEffect } from 'react';
import { 
  HardDrive, 
  Cpu, 
  Activity, 
  LayoutGrid, 
  List, 
  RefreshCw, 
  Search,
  Server,
  Film,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check
} from 'lucide-react';
import { SystemStats, StorageInfo, SortField, SortOrder } from '../types';
import { formatBytes } from '../utils/format';

interface HeaderProps {
  stats: SystemStats | null;
  activeStorage: StorageInfo | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: 'grid' | 'list' | 'netflix';
  onViewModeChange: (m: 'grid' | 'list' | 'netflix') => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  hasVideos?: boolean;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  activeStorage,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  isRefreshing,
  hasVideos,
  sortField,
  sortOrder,
  onSortChange,
}) => {
  const disk = activeStorage ? activeStorage.disk : stats?.disk;
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
    { id: 'type', label: '파일 형식순' },
  ];

  return (
    <header className="h-16 border-b border-[#252530] bg-[#16161d] px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
      {/* Brand & Hostname */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Server className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base text-white tracking-tight">MiniNAS</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Mac mini 2011
            </span>
          </div>
          <p className="text-xs text-gray-400 font-mono">
            {stats ? `${stats.hostname} (${stats.os})` : 'Connecting...'}
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="flex-1 max-w-md mx-6">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="현재 폴더에서 검색..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#1f1f28] border border-[#2e2e3d] rounded-lg pl-10 pr-4 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/60 transition"
          />
        </div>
      </div>

      {/* Right: Stats & View controls */}
      <div className="flex items-center gap-3">
        {/* Hardware Status Chips */}
        {stats && (
          <div className="hidden xl:flex items-center gap-3 text-xs bg-[#1f1f28] border border-[#2a2a38] px-3.5 py-1.5 rounded-lg">
            {/* Disk */}
            {disk && (
              <div className="flex items-center gap-2" title={`${activeStorage?.name || '디스크'}: 총 ${formatBytes(disk.totalBytes)} 중 ${formatBytes(disk.usedBytes)} 사용`}>
                <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 leading-none truncate max-w-[70px]">
                    {activeStorage ? activeStorage.name : '디스크'}
                  </span>
                  <span className="font-mono text-gray-200 font-medium">
                    {disk.usedPercent.toFixed(0)}%
                  </span>
                </div>
                <div className="w-10 h-1.5 bg-[#2c2c3b] rounded-full overflow-hidden ml-1">
                  <div 
                    className={`h-full rounded-full ${disk.usedPercent > 85 ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(disk.usedPercent, 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="w-px h-5 bg-[#2f2f3d]" />

            {/* RAM */}
            <div className="flex items-center gap-2" title={`메모리: ${formatBytes(stats.memory.usedBytes)} / ${formatBytes(stats.memory.totalBytes)}`}>
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 leading-none">RAM</span>
                <span className="font-mono text-gray-200 font-medium">{stats.memory.usedPercent.toFixed(0)}%</span>
              </div>
            </div>

            <div className="w-px h-5 bg-[#2f2f3d]" />

            {/* CPU */}
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400 leading-none">CPU</span>
                <span className="font-mono text-gray-200 font-medium">{stats.cpuPercent.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Sorting Dropdown */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setIsSortOpen(!isSortOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white bg-[#1f1f28] hover:bg-[#282838] border border-[#2a2a38] rounded-lg transition"
            title="정렬 기준"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
            <span className="hidden sm:inline">
              {sortOptions.find(o => o.id === sortField)?.label}
            </span>
            {sortOrder === 'asc' ? (
              <ArrowUp className="w-3 h-3 text-blue-400" />
            ) : (
              <ArrowDown className="w-3 h-3 text-blue-400" />
            )}
          </button>

          {isSortOpen && (
            <div className="absolute right-0 mt-1 w-36 bg-[#1c1c28] border border-[#2e2e42] rounded-xl shadow-xl py-1 z-40 text-xs animate-scaleUp">
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                정렬 방식
              </div>
              {sortOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    onSortChange(opt.id);
                    setIsSortOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left flex items-center justify-between text-gray-200 hover:bg-[#28283a] transition"
                >
                  <span>{opt.label}</span>
                  {sortField === opt.id && (
                    <Check className="w-3.5 h-3.5 text-blue-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-[#1f1f28] border border-[#2a2a38] rounded-lg p-0.5">
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
            title="격자 보기"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
            title="목록 보기"
          >
            <List className="w-4 h-4" />
          </button>

          {/* Netflix View Button (Highlighted when folder has videos) */}
          <button
            onClick={() => onViewModeChange('netflix')}
            className={`relative p-1.5 rounded-md transition flex items-center gap-1 ${
              viewMode === 'netflix'
                ? 'bg-red-600 text-white shadow-sm shadow-red-900/50'
                : hasVideos
                ? 'text-red-400 hover:text-red-300 hover:bg-red-950/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            title="넷플릭스 뷰 (시네마 모드)"
          >
            <Film className="w-4 h-4" />
            {hasVideos && viewMode !== 'netflix' && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse absolute top-1 right-1" />
            )}
          </button>
        </div>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-gray-400 hover:text-gray-200 hover:bg-[#1f1f28] rounded-lg border border-transparent hover:border-[#2a2a38] transition disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>
    </header>
  );
};
