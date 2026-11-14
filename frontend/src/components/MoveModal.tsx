import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Folder, 
  ChevronRight, 
  ArrowRight, 
  FolderPlus, 
  CornerLeftUp,
  Check,
  RefreshCw
} from 'lucide-react';
import { FileItem, BreadcrumbItem } from '../types';
import { api } from '../api';

interface MoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourcePaths: string[];
  currentStorageId: string;
  currentStorageName: string;
  onMoveSuccess: (targetDir: string, movedCount: number) => void;
}

export const MoveModal: React.FC<MoveModalProps> = ({
  isOpen,
  onClose,
  sourcePaths,
  currentStorageId,
  currentStorageName,
  onMoveSuccess,
}) => {
  const [browsePath, setBrowsePath] = useState<string>('/');
  const [subFolders, setSubFolders] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load directories of current browsePath
  const loadFolders = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getFiles(path, currentStorageId);
      // Filter directories only, and exclude any folder that is in sourcePaths (cannot move folder into itself)
      const dirs = data.items.filter(item => {
        if (!item.isDir) return false;
        if (sourcePaths.includes(item.path)) return false;
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
      setBrowsePath('/');
      loadFolders('/');
      setIsCreatingFolder(false);
      setNewFolderName('');
      setError(null);
    }
  }, [isOpen, loadFolders]);

  const handleNavigate = (path: string) => {
    setBrowsePath(path);
    loadFolders(path);
  };

  const handleGoUp = () => {
    if (browsePath === '/') return;
    const parts = browsePath.split('/').filter(Boolean);
    parts.pop();
    const upPath = '/' + parts.join('/');
    handleNavigate(upPath);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await api.createFolder(browsePath, newFolderName.trim(), currentStorageId);
      setNewFolderName('');
      setIsCreatingFolder(false);
      loadFolders(browsePath);
    } catch (err: any) {
      setError(err.message || '폴더 생성 실패');
    }
  };

  const handleExecuteMove = async () => {
    if (sourcePaths.length === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await api.moveItems(sourcePaths, browsePath, currentStorageId);
      onMoveSuccess(browsePath, res.moved);
      onClose();
    } catch (err: any) {
      setError(err.message || '파일 이동 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Breadcrumbs
  const pathParts = browsePath.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [
    { name: currentStorageName || '루트', path: '/' },
    ...pathParts.map((part, index) => ({
      name: part,
      path: '/' + pathParts.slice(0, index + 1).join('/'),
    })),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-[#1b1b24] border border-[#2e2e42] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#28283a] bg-[#161620]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ArrowRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">폴더로 이동</h3>
              <p className="text-xs text-gray-400">
                선택한 <strong className="text-amber-400">{sourcePaths.length}개</strong> 항목을 이동할 폴더를 선택하세요
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-[#28283a] rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumb Path & Go Up Button */}
        <div className="px-6 py-2.5 bg-[#14141c] border-b border-[#252536] flex items-center justify-between gap-2 text-xs">
          <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.path}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />}
                <button
                  onClick={() => handleNavigate(crumb.path)}
                  className={`px-1.5 py-0.5 rounded transition shrink-0 ${
                    idx === breadcrumbs.length - 1
                      ? 'font-bold text-white bg-white/10'
                      : 'text-gray-400 hover:text-white'
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
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#232332] hover:bg-[#2d2d40] text-gray-300 transition"
                title="상위 폴더로 이동"
              >
                <CornerLeftUp className="w-3.5 h-3.5" />
                <span>상위</span>
              </button>
            )}
            <button
              onClick={() => setIsCreatingFolder(!isCreatingFolder)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[#232332] hover:bg-[#2d2d40] text-blue-400 transition"
              title="새 하위 폴더 생성"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>새 폴더</span>
            </button>
          </div>
        </div>

        {/* Inline Create Folder Form */}
        {isCreatingFolder && (
          <form onSubmit={handleCreateFolder} className="px-6 py-2.5 bg-[#1d1d2b] border-b border-[#2a2a3e] flex items-center gap-2 text-xs">
            <input
              type="text"
              placeholder="새 폴더 이름 입력..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              className="flex-1 bg-[#14141c] border border-[#33334a] rounded-lg px-3 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition"
            >
              생성
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingFolder(false)}
              className="px-2 py-1.5 text-gray-400 hover:text-white transition"
            >
              취소
            </button>
          </form>
        )}

        {/* Folder List Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 min-h-[220px] max-h-[360px] scrollbar-thin scrollbar-thumb-[#2a2a3e]">
          {error && (
            <div className="p-3 mb-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-xs">폴더 목록 확인 중...</span>
            </div>
          ) : subFolders.length === 0 ? (
            <div className="text-center py-10 text-gray-500 space-y-1">
              <Folder className="w-8 h-8 mx-auto opacity-30 text-gray-400" />
              <p className="text-xs">하위 폴더가 없습니다.</p>
              <p className="text-[11px] text-gray-600">현재 위치: <code className="text-gray-400 font-mono">{browsePath}</code></p>
            </div>
          ) : (
            subFolders.map((folder) => (
              <div
                key={folder.path}
                onClick={() => handleNavigate(folder.path)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-[#252536] border border-transparent hover:border-[#35354c] cursor-pointer text-xs text-gray-200 transition group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Folder className="w-4 h-4 text-blue-400 shrink-0 fill-blue-400/20" />
                  <span className="font-medium truncate group-hover:text-white">{folder.name}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 shrink-0" />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#28283a] bg-[#161620] flex items-center justify-between gap-3">
          <div className="text-xs text-gray-400 truncate max-w-[240px]">
            선택 위치: <strong className="text-gray-200 font-mono">{browsePath}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white bg-[#222230] hover:bg-[#2b2b3d] transition"
            >
              취소 (ESC)
            </button>
            <button
              onClick={handleExecuteMove}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>여기로 이동</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
