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

  const handleRestore = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsProcessing(true);
    try {
      await api.restoreTrash(ids);
      onShowToast(`${ids.length}개 항목을 원래 위치로 복구했습니다.`, 'success');
      loadTrash();
      onRefreshStorages();
    } catch (err: any) {
      onShowToast(`복구 실패: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeletePermanently = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}개 항목을 완전히 영구 삭제하시겠습니까? 복구할 수 없습니다.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      await api.deleteTrashPermanently(ids);
      onShowToast(`${ids.length}개 항목을 영구 삭제했습니다.`, 'success');
      loadTrash();
      onRefreshStorages();
    } catch (err: any) {
      onShowToast(`영구 삭제 실패: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

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
    <div className="flex-1 flex flex-col h-full bg-surface-base text-content-primary overflow-hidden">
      {/* Top Header */}
      <div className="h-12 border-b border-surface-border px-4 sm:px-5 flex items-center justify-between bg-surface-base shrink-0 gap-3">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-content-muted" />
          <span className="text-xs font-semibold text-content-primary">휴지통</span>
          <span className="text-[11px] text-content-muted font-mono">
            ({totalCount}개 · {formatBytes(totalSize)})
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {storages.length > 1 && (
            <select
              value={selectedStorage}
              onChange={(e) => setSelectedStorage(e.target.value)}
              className="bg-surface-card border border-surface-border text-xs text-content-primary rounded-md px-2 py-1 focus:outline-none focus:border-accent"
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
            className="p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-cardHover transition disabled:opacity-40"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => handleRestore(Array.from(selectedIds))}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-accent-btn hover:bg-accent-btnHover text-accent-btnText border border-accent-btnBorder transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>선택 복구 ({selectedIds.size})</span>
              </button>

              <button
                onClick={() => handleDeletePermanently(Array.from(selectedIds))}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
              >
                <Trash2 className="w-3 h-3" />
                <span>영구 삭제 ({selectedIds.size})</span>
              </button>
            </>
          )}

          <button
            onClick={handleEmptyTrash}
            disabled={totalCount === 0 || isProcessing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-content-secondary hover:text-red-400 hover:bg-surface-cardHover transition disabled:opacity-40"
          >
            <AlertTriangle className="w-3 h-3" />
            <span>휴지통 비우기</span>
          </button>
        </div>
      </div>

      {/* Main Content / Table */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-content-muted gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-accent" />
            <span className="text-xs">휴지통을 불러오는 중...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-72 text-content-muted space-y-2">
            <Trash2 className="w-10 h-10 stroke-[1.25] text-content-muted opacity-40 mb-1" />
            <p className="text-xs font-medium text-content-secondary">휴지통이 비어 있습니다</p>
          </div>
        ) : (
          <div className="border border-surface-border rounded-lg overflow-hidden bg-surface-card/30">
            {/* Table Header */}
            <div className="flex items-center px-4 py-2 border-b border-surface-border text-xs text-content-muted select-none bg-surface-base">
              <button
                onClick={handleSelectAll}
                className="mr-3 text-content-muted hover:text-content-primary"
                title={selectedIds.size === items.length ? "선택 해제" : "모두 선택"}
              >
                {selectedIds.size > 0 && selectedIds.size === items.length ? (
                  <CheckSquare className="w-3.5 h-3.5 text-accent" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
              </button>
              <div className="flex-1 min-w-0">이름</div>
              <div className="hidden md:block w-48 shrink-0 px-2">원래 위치</div>
              <div className="hidden sm:block w-32 shrink-0 text-right px-2">삭제 날짜</div>
              <div className="w-20 shrink-0 text-right px-2">크기</div>
              <div className="w-20 shrink-0 text-center">동작</div>
            </div>

            {/* Item Rows */}
            <div className="divide-y divide-surface-borderSubtle">
              {items.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center px-4 py-2 text-xs transition select-none ${
                      isSelected ? 'bg-accent-subtle text-content-primary' : 'hover:bg-surface-cardHover text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    <button
                      onClick={() => handleToggleSelect(item.id)}
                      className="mr-3 text-content-muted hover:text-content-primary shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-accent" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0 flex items-center gap-2 pr-2">
                      <div className="shrink-0">
                        {item.isDir ? (
                          <Folder className="w-4 h-4 text-accent" />
                        ) : (
                          <FileText className="w-4 h-4 text-content-muted" />
                        )}
                      </div>
                      <span className="font-normal truncate" title={item.name}>
                        {item.name}
                      </span>
                    </div>

                    <div className="hidden md:block w-48 shrink-0 px-2 text-content-muted font-mono truncate text-[11px]" title={item.originalPath}>
                      <span className="text-[10px] text-content-muted mr-1">
                        [{getStorageName(item.storageId)}]
                      </span>
                      {item.originalPath}
                    </div>

                    <div className="hidden sm:block w-32 shrink-0 text-right px-2 text-content-muted text-[11px]">
                      {formatDate(item.deletedAt)}
                    </div>

                    <div className="w-20 shrink-0 text-right px-2 font-mono text-content-muted text-[11px]">
                      {formatBytes(item.size)}
                    </div>

                    <div className="w-20 shrink-0 flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleRestore([item.id])}
                        disabled={isProcessing}
                        className="p-1 rounded text-content-muted hover:text-accent hover:bg-surface-card transition"
                        title="원래 위치로 복구"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePermanently([item.id])}
                        disabled={isProcessing}
                        className="p-1 rounded text-content-muted hover:text-red-400 hover:bg-surface-card transition"
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
