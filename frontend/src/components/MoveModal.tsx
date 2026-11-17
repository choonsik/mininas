import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Folder, 
  ChevronRight, 
  ArrowRight, 
  FolderPlus, 
  CornerLeftUp,
  Check,
  RefreshCw,
  HardDrive
} from 'lucide-react';
import { FileItem, BreadcrumbItem, StorageInfo } from '../types';
import { api } from '../api';
import { formatBytes } from '../utils/format';

interface MoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourcePaths: string[];
  currentStorageId: string;
  storages: StorageInfo[];
  onMoveSuccess: (targetDir: string, movedCount: number, targetStorageId: string) => void;
}

export const MoveModal: React.FC<MoveModalProps> = ({
  isOpen,
  onClose,
  sourcePaths,
  currentStorageId,
  storages,
  onMoveSuccess,
}) => {
  const [targetStorageId, setTargetStorageId] = useState<string>(currentStorageId);
  const [browsePath, setBrowsePath] = useState<string>('/');
  const [subFolders, setSubFolders] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeTargetStorage = storages.find(s => s.id === targetStorageId) || storages[0] || null;

  const loadFolders = useCallback(async (path: string, storageId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getFiles(path, storageId);
      const dirs = data.items.filter(item => {
        if (!item.isDir) return false;
        if (storageId === currentStorageId && sourcePaths.includes(item.path)) return false;
        return true;
      });
      setSubFolders(dirs);
    } catch (err: any) {
      setError(err.message || '폴더 목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [currentStorageId, sourcePaths]);

  useEffect(() => {
    if (isOpen) {
      setTargetStorageId(currentStorageId);
      setBrowsePath('/');
      loadFolders('/', currentStorageId);
      setIsCreatingFolder(false);
      setNewFolderName('');
      setError(null);
    }
  }, [isOpen, currentStorageId, loadFolders]);

  const handleSelectStorage = (storageId: string) => {
    setTargetStorageId(storageId);
    setBrowsePath('/');
    loadFolders('/', storageId);
  };

  const handleNavigate = (path: string) => {
    setBrowsePath(path);
    loadFolders(path, targetStorageId);
  };

  const handleGoUp = () => {
    if (browsePath === '/') return;
    const parts = browsePath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/');
    handleNavigate(parentPath);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await api.createFolder(browsePath, newFolderName.trim(), targetStorageId);
      setNewFolderName('');
      setIsCreatingFolder(false);
      loadFolders(browsePath, targetStorageId);
    } catch (err: any) {
      setError(err.message || '폴더 생성 실패');
    }
  };

  const handleExecuteMove = async () => {
    if (sourcePaths.length === 0) return;

    if (targetStorageId === currentStorageId) {
      const allInSameDir = sourcePaths.every(sp => {
        const parts = sp.split('/').filter(Boolean);
        parts.pop();
        const parent = parts.length === 0 ? '/' : '/' + parts.join('/');
        return parent === browsePath;
      });
      if (allInSameDir) {
        setError('출발지 폴더와 대상 폴더가 동일합니다.');
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await api.moveItems(sourcePaths, browsePath, currentStorageId, targetStorageId);
      onMoveSuccess(browsePath, res.moved, targetStorageId);
      onClose();
    } catch (err: any) {
      setError(err.message || '파일 이동 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const pathParts = browsePath.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [
    { name: activeTargetStorage?.name || '루트', path: '/' },
    ...pathParts.map((part, index) => ({
      name: part,
      path: '/' + pathParts.slice(0, index + 1).join('/'),
    })),
  ];

  const isCrossStorage = targetStorageId !== currentStorageId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
      <div 
        className="bg-surface-card border border-surface-border rounded-lg w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh] text-content-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-border bg-surface-header">
          <div>
            <h3 className="text-sm font-semibold">폴더 이동</h3>
            <p className="text-[11px] text-content-muted mt-0.5">
              선택한 {sourcePaths.length}개 항목을 이동할 위치를 선택하세요
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-content-muted hover:text-content-primary hover:bg-surface-cardHover rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Storage Tabs */}
        {storages.length > 1 && (
          <div className="px-5 py-2 bg-surface-base border-b border-surface-border flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
            <span className="text-[11px] text-content-muted mr-1">저장소:</span>
            {storages.map((s) => {
              const isSelected = s.id === targetStorageId;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSelectStorage(s.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition text-xs ${
                    isSelected
                      ? 'bg-surface-card border border-surface-border font-medium text-content-primary'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  <HardDrive className="w-3 h-3 text-content-muted" />
                  <span>{s.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Breadcrumb Path & Go Up Button */}
        <div className="px-5 py-2 border-b border-surface-border flex items-center justify-between gap-2 text-xs bg-surface-base">
          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.path}>
                {idx > 0 && <ChevronRight className="w-3 h-3 text-content-muted shrink-0" />}
                <button
                  onClick={() => handleNavigate(crumb.path)}
                  className={`px-1 py-0.5 rounded transition shrink-0 ${
                    idx === breadcrumbs.length - 1
                      ? 'font-medium text-content-primary'
                      : 'text-content-muted hover:text-content-primary'
                  }`}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            {browsePath !== '/' && (
              <button
                onClick={handleGoUp}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-card hover:bg-surface-cardHover text-content-secondary hover:text-content-primary transition text-xs border border-surface-border"
                title="상위 폴더"
              >
                <CornerLeftUp className="w-3 h-3" />
                <span>상위</span>
              </button>
            )}
            <button
              onClick={() => setIsCreatingFolder(!isCreatingFolder)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-card hover:bg-surface-cardHover text-content-secondary hover:text-content-primary transition text-xs border border-surface-border"
              title="새 하위 폴더"
            >
              <FolderPlus className="w-3 h-3" />
              <span>새 폴더</span>
            </button>
          </div>
        </div>

        {/* Inline Create Folder Form */}
        {isCreatingFolder && (
          <form onSubmit={handleCreateFolder} className="px-5 py-2 bg-surface-card border-b border-surface-border flex items-center gap-2 text-xs">
            <input
              type="text"
              placeholder="새 폴더 이름..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              className="flex-1 bg-surface-base border border-surface-border rounded px-2.5 py-1 text-content-primary placeholder-content-muted focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-accent-btn hover:bg-accent-btnHover text-accent-btnText border border-accent-btnBorder rounded text-xs font-medium transition"
            >
              생성
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingFolder(false)}
              className="px-2 py-1 text-content-muted hover:text-content-primary transition"
            >
              취소
            </button>
          </form>
        )}

        {/* Folder List Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-0.5 min-h-[200px] max-h-[300px]">
          {error && (
            <div className="p-2.5 mb-2 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-content-muted space-y-1.5">
              <RefreshCw className="w-4 h-4 animate-spin text-accent" />
              <span className="text-xs">폴더 확인 중...</span>
            </div>
          ) : subFolders.length === 0 ? (
            <div className="text-center py-10 text-content-muted space-y-1">
              <Folder className="w-6 h-6 mx-auto opacity-30 text-content-muted" />
              <p className="text-xs">하위 폴더가 없습니다</p>
            </div>
          ) : (
            subFolders.map((folder) => (
              <div
                key={folder.path}
                onClick={() => handleNavigate(folder.path)}
                className="flex items-center justify-between px-3 py-1.5 rounded hover:bg-surface-cardHover cursor-pointer text-xs text-content-secondary hover:text-content-primary transition"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Folder className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-content-muted shrink-0" />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-surface-border bg-surface-header flex items-center justify-between gap-3 text-xs">
          <div className="text-content-muted truncate max-w-[240px]">
            {isCrossStorage ? (
              <span>[다른 저장소]: {activeTargetStorage?.name}:{browsePath}</span>
            ) : (
              <span>위치: <span className="font-mono text-content-primary">{browsePath}</span></span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1 rounded text-content-secondary hover:text-content-primary transition"
            >
              취소
            </button>
            <button
              onClick={handleExecuteMove}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-3.5 py-1 rounded font-medium bg-accent-btn hover:bg-accent-btnHover text-accent-btnText border border-accent-btnBorder transition disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>이동 중...</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" />
                  <span>여기로 이동</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
