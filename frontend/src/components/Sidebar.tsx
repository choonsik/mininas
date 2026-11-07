import React from 'react';
import { 
  Folder, 
  Image as ImageIcon, 
  Film, 
  Music, 
  FileText, 
  Layers, 
  Zap, 
  Network,
  Clock,
  HardDrive
} from 'lucide-react';
import { SystemStats, StorageInfo } from '../types';
import { formatBytes } from '../utils/format';

interface SidebarProps {
  storages: StorageInfo[];
  activeStorageId: string;
  onSelectStorage: (id: string) => void;
  currentFilter: string;
  onSelectFilter: (filter: string) => void;
  stats: SystemStats | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  storages,
  activeStorageId,
  onSelectStorage,
  currentFilter,
  onSelectFilter,
  stats,
}) => {
  const menuItems = [
    { id: 'all', label: '모든 파일', icon: Folder },
    { id: 'image', label: '사진 & 이미지', icon: ImageIcon },
    { id: 'video', label: '동영상', icon: Film },
    { id: 'audio', label: '음악 & 오디오', icon: Music },
    { id: 'text', label: '문서 & 텍스트', icon: FileText },
    { id: 'archive', label: '압축 파일', icon: Layers },
  ];

  const formatUptime = (sec: number) => {
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (days > 0) return `${days}일 ${hours}시간`;
    return `${hours}시간 ${mins}분`;
  };

  return (
    <aside className="w-64 border-r border-[#252530] bg-[#14141a] flex flex-col justify-between p-4 select-none overflow-y-auto">
      <div className="space-y-6">
        {/* Storages (Locations) */}
        <div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3">
            저장소 (Locations)
          </span>
          <nav className="mt-2 space-y-1.5">
            {storages.map((storage) => {
              const isActive = activeStorageId === storage.id;
              return (
                <button
                  key={storage.id}
                  onClick={() => onSelectStorage(storage.id)}
                  className={`w-full text-left p-2.5 rounded-xl transition border ${
                    isActive
                      ? 'bg-blue-600/15 border-blue-500/30 text-white shadow-sm'
                      : 'bg-[#191922] border-[#252533] text-gray-300 hover:bg-[#20202c] hover:border-[#323245]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-lg ${isActive ? 'bg-blue-600 text-white' : 'bg-[#252535] text-blue-400'}`}>
                      <HardDrive className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate leading-tight">
                        {storage.name}
                      </div>
                      <div className="text-[10px] text-gray-400 truncate mt-0.5 font-mono">
                        남음 {formatBytes(storage.disk.freeBytes)}
                      </div>
                    </div>
                  </div>

                  {/* Tiny progress bar */}
                  <div className="w-full h-1 bg-[#282835] rounded-full overflow-hidden mt-2">
                    <div
                      className={`h-full rounded-full ${storage.disk.usedPercent > 85 ? 'bg-red-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.min(storage.disk.usedPercent, 100)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Media Categories */}
        <div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-3">
            파일 필터
          </span>
          <nav className="mt-2 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentFilter === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectFilter(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/25'
                      : 'text-gray-300 hover:bg-[#1e1e26] hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-gray-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mac mini hardware info badge */}
      <div className="mt-6 bg-[#181820] border border-[#242430] rounded-xl p-3 text-xs space-y-2 text-gray-400">
        <div className="flex items-center justify-between text-gray-300 font-medium pb-1.5 border-b border-[#282834]">
          <span className="flex items-center gap-1.5 text-[11px]">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            저전력 홈 서버
          </span>
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
            ONLINE
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1">
            <Network className="w-3 h-3 text-blue-400" />
            이더넷
          </span>
          <span className="font-mono text-gray-300">1 Gbps LAN</span>
        </div>

        {stats && stats.uptimeSeconds > 0 && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-purple-400" />
              가동 시간
            </span>
            <span className="font-mono text-gray-300">{formatUptime(stats.uptimeSeconds)}</span>
          </div>
        )}
      </div>
    </aside>
  );
};
