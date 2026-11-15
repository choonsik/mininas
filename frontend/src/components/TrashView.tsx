import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Trash2, 
  RotateCcw, 
  AlertTriangle, 
  CheckSquare, 
  Square, 
  Folder, 
  FileText, 
  RefreshCw
} from 'lucide-react';
import { StorageInfo, TrashResponse } from '../types';
import { api } from '../api';
import { formatBytes, formatDate } from '../utils/format';

interface TrashViewProps {
  storages: StorageInfo[];
  activeStorageId: string;
  onShowToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshStorages: () => void;
}

export const TrashView: React.FC<TrashViewProps> = ({
  storages,
  activeStorageId,
  onShowToast,
  onRefreshStorages,
}) => {
  const [selectedStorage, setSelectedStorage] = useState<string>(activeStorageId || 'all');
  const [trashData, setTrashData] = useState<TrashResponse>({ items: [], totalSize: 0, totalCount: 0 });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Safe fallback to prevent any null reference errors
  const items = useMemo(() => (Array.isArray(trashData?.items) ? trashData.items : []), [trashData]);
  const totalCount = trashData?.totalCount ?? items.length;
  const totalSize = trashData?.totalSize ?? 0;

  const loadTrash = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.getTrash(selectedStorage === 'all' ? '' : selectedStorage);
      setTrashData({
        items: Array.isArray(data?.items) ? data.items : [],
        totalSize: typeof data?.totalSize === 'number' ? data.totalSize : 0,
        totalCount: typeof data?.totalCount === 'number' ? data.totalCount : (Array.isArray(data?.items) ? data.items.length : 0),
      });
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error('Failed to load trash:', err);
      setTrashData({ items: [], totalSize: 0, totalCount: 0 });
      onShowToast(`휴지통 불러오기 실패: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [selectedStorage, onShowToast]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(item => item.id)));
    }
  };

  // Restore items
  const handleRestore = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsProcessing(true);
    try {
      // Group by storage if multiple storages
      const byStorage: Record<string, string[]> = {};
      items
        .filter(item => ids.includes(item.id))
        .forEach(item => {
          const sid = item.storageId || activeStorageId || 'default';
          if (!byStorage[sid]) byStorage[sid] = [];
          byStorage[sid].push(item.id);
        });

      let totalRestored = 0;
      for (const [sId, sIds] of Object.entries(byStorage)) {
        const res = await api.restoreTrash(sIds, sId);
        totalRestored += res.restored;
      }

      onShowToast(`${totalRestored}개 항목이 복구되었습니다.`, 'success');
      loadTrash();
      onRefreshStorages();
    } catch (err: any) {
      onShowToast(`복구 실패: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete items permanently
  const handleDeletePermanently = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}개 항목을 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며 디스크에서 완전히 삭제됩니다.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const byStorage: Record<string, string[]> = {};
      items
        .filter(item => ids.includes(item.id))
        .forEach(item => {
          const sid = item.storageId || activeStorageId || 'default';
          if (!byStorage[sid]) byStorage[sid] = [];
          byStorage[sid].push(item.id);
        });

      let totalDeleted = 0;
      for (const [sId, sIds] of Object.entries(byStorage)) {
        const res = await api.deleteTrashPermanently(sIds, sId);
        totalDeleted += res.deleted;
      }

      onShowToast(`${totalDeleted}개 항목이 영구 삭제되었습니다.`, 'success');
      loadTrash();
      onRefreshStorages();
    } catch (err: any) {
      onShowToast(`영구 삭제 실패: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Empty entire trash
  const handleEmptyTrash = async () => {
    if (totalCount === 0) return;
    const targetLabel = selectedStorage === 'all' ? '모든 저장소' : (storages.find(s => s.id === selectedStorage)?.name || '선택한 저장소');
    if (!confirm(`[${targetLabel}]의 휴지통을 비우시겠습니까?\n\n모든 파일과 폴더가 영구적으로 삭제되며 복구할 수 없습니다.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      await api.emptyTrash(selectedStorage === 'all' ? '' : selectedStorage);
      onShowToast('휴지통을 모두 비웠습니다.', 'success');
      loadTrash();
      onRefreshStorages();
    } catch (err: any) {
      onShowToast(`휴지통 비우기 실패: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStorageName = (storageId: string) => {
    const s = storages.find(st => st.id === storageId);
    return s ? s.name : storageId;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0c0d12] text-gray-200 overflow-hidden">
      {/* Top Header */}
      <div className="p-4 md:p-6 border-b border-[#232330] bg-[#12131a] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                휴지통
                <span className="text-xs font-normal text-gray-400 font-mono">
                  ({totalCount}개 항목 · {formatBytes(totalSize)})
                </span>
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                삭제된 파일이 임시 보관되며, 필요할 때 언제든 원래 위치로 복구할 수 있습니다.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Storage selector if more than 1 storage */}
          {storages.length > 1 && (
            <select
              value={selectedStorage}
              onChange={(e) => setSelectedStorage(e.target.value)}
              className="bg-[#1b1c24] border border-[#2d2e3d] text-xs text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="all">모든 저장소</option>
              {storages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => loadTrash()}
            disabled={isLoading || isProcessing}
            className="p-1.5 rounded-lg border border-[#2d2e3d] hover:bg-[#20212c] text-gray-400 hover:text-white transition"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => handleRestore(Array.from(selectedIds))}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>선택 복구 ({selectedIds.size})</span>
              </button>

              <button
                onClick={() => handleDeletePermanently(Array.from(selectedIds))}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/80 hover:bg-red-600 text-white transition shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>영구 삭제 ({selectedIds.size})</span>
              </button>
            </>
          )}

          <button
            onClick={handleEmptyTrash}
            disabled={totalCount === 0 || isProcessing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
              totalCount > 0
                ? 'bg-[#1e171b] border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300'
                : 'bg-[#171720] border-[#252530] text-gray-500 cursor-not-allowed'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>휴지통 비우기</span>
          </button>
        </div>
      </div>

      {/* Main Content / Table */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-sm">휴지통을 불러오는 중...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 text-gray-500 gap-3">
            <div className="w-16 h-16 rounded-full bg-[#181822] flex items-center justify-center border border-[#262635]">
              <Trash2 className="w-8 h-8 text-gray-500 stroke-[1.5]" />
            </div>
            <p className="text-sm font-medium text-gray-400">휴지통이 비어 있습니다.</p>
            <p className="text-xs text-gray-500">파일을 삭제하면 언제든 여기서 다시 복구할 수 있습니다.</p>
          </div>
        ) : (
          <div className="bg-[#14151e] border border-[#242433] rounded-2xl overflow-hidden shadow-lg">
            {/* Table Header */}
            <div className="flex items-center px-4 py-3 bg-[#191a26] border-b border-[#242433] text-xs font-semibold text-gray-400 select-none">
              <button
                onClick={handleSelectAll}
                className="mr-3 text-gray-400 hover:text-white"
                title={selectedIds.size === items.length ? "선택 해제" : "모두 선택"}
              >
                {selectedIds.size > 0 && selectedIds.size === items.length ? (
                  <CheckSquare className="w-4 h-4 text-blue-400" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
              <div className="flex-1 min-w-0">이름</div>
              <div className="hidden md:block w-52 shrink-0 px-2">원래 위치</div>
              <div className="hidden sm:block w-36 shrink-0 text-right px-2">삭제 날짜</div>
              <div className="w-24 shrink-0 text-right px-2">크기</div>
              <div className="w-24 shrink-0 text-center">동작</div>
            </div>

            {/* Item Rows */}
            <div className="divide-y divide-[#1e1f2b]">
              {items.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center px-4 py-3 text-xs transition group ${
                      isSelected ? 'bg-blue-600/10' : 'hover:bg-[#1a1b26]'
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleSelect(item.id)}
                      className="mr-3 text-gray-400 hover:text-white shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    {/* Name & Icon */}
                    <div className="flex-1 min-w-0 flex items-center gap-2.5 pr-2">
                      <div className="shrink-0">
                        {item.isDir ? (
                          <Folder className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                        ) : (
                          <FileText className="w-4 h-4 text-blue-400" />
                        )}
                      </div>
                      <span className="font-medium text-gray-200 truncate" title={item.name}>
                        {item.name}
                      </span>
                    </div>

                    {/* Original Path */}
                    <div className="hidden md:block w-52 shrink-0 px-2 text-gray-400 font-mono truncate" title={item.originalPath}>
                      <span className="text-[10px] bg-[#222332] px-1.5 py-0.5 rounded text-gray-400 mr-1.5">
                        {getStorageName(item.storageId)}
                      </span>
                      {item.originalPath}
                    </div>

                    {/* Deleted Date */}
                    <div className="hidden sm:block w-36 shrink-0 text-right px-2 text-gray-400 font-mono text-[11px]">
                      {formatDate(item.deletedAt)}
                    </div>

                    {/* Size */}
                    <div className="w-24 shrink-0 text-right px-2 font-mono text-gray-400 text-[11px]">
                      {formatBytes(item.size)}
                    </div>

                    {/* Actions */}
                    <div className="w-24 shrink-0 flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleRestore([item.id])}
                        disabled={isProcessing}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition"
                        title="원래 위치로 복구"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePermanently([item.id])}
                        disabled={isProcessing}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="영구 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
