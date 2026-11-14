import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { FileList } from './components/FileList';
import { NetflixView } from './components/NetflixView';
import { MediaViewer } from './components/MediaViewer';
import { UploadModal } from './components/UploadModal';
import { NewFolderModal } from './components/NewFolderModal';
import { RenameModal } from './components/RenameModal';
import { FileDetailsModal } from './components/FileDetailsModal';
import { ContextMenu } from './components/ContextMenu';
import { FileItem, SystemStats, StorageInfo, SortField, SortOrder, ClipboardItem } from './types';
import { api } from './api';
import { UploadCloud, CheckCircle, AlertCircle, X } from 'lucide-react';

export const App: React.FC = () => {
  // Storage state
  const [storages, setStorages] = useState<StorageInfo[]>([]);
  const [activeStorageId, setActiveStorageId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('storage') || '';
  });

  const [currentPath, setCurrentPath] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('path') || '/';
  });
  const [items, setItems] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<SystemStats | null>(null);

  // Filters & Search & ViewMode
  const [currentFilter, setCurrentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'netflix'>(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    return v === 'list' || v === 'netflix' ? v : 'grid';
  });

  // Sorting
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Selection
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Clipboard (Copy / Cut)
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);

  // Modals & Viewers
  const [activeMediaItem, setActiveMediaItem] = useState<FileItem | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [detailItem, setDetailItem] = useState<FileItem | null>(null);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    item: FileItem | null;
  } | null>(null);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Drag & drop upload state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; label: string } | null>(null);

  // Show Toast Helper
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(prev => (prev?.text === text ? null : prev));
    }, 3500);
  };

  // Active storage object
  const activeStorage = useMemo(() => {
    return storages.find(s => s.id === activeStorageId) || storages[0] || null;
  }, [storages, activeStorageId]);

  // Check if current directory has video files
  const hasVideos = useMemo(() => {
    return items.some(item => !item.isDir && item.mediaType === 'video');
  }, [items]);

  // Build URL helper
  const buildUrl = (storageId: string, path: string, view: string = viewMode, playName?: string) => {
    const params = new URLSearchParams();
    if (storageId) params.set('storage', storageId);
    if (path && path !== '/') params.set('path', path);
    if (view && view !== 'grid') params.set('view', view);
    if (playName) params.set('play', playName);
    const qs = params.toString();
    return qs ? `?${qs}` : window.location.pathname;
  };

  // Load storages list
  const loadStorages = useCallback(async () => {
    try {
      const data = await api.getStorages();
      setStorages(data);
      if (data.length > 0) {
        setActiveStorageId((prev) => {
          if (prev && data.some(s => s.id === prev)) return prev;
          const params = new URLSearchParams(window.location.search);
          const urlStorage = params.get('storage');
          if (urlStorage && data.some(s => s.id === urlStorage)) return urlStorage;
          return data[0].id;
        });
      }
    } catch (err) {
      console.warn('Failed to load storages:', err);
    }
  }, []);

  // Load files
  const loadFiles = useCallback(async (path: string, storageId: string) => {
    setIsLoading(true);
    try {
      const data = await api.getFiles(path, storageId);
      setItems(data.items);
      setSelectedPaths(new Set());
    } catch (err: any) {
      showToast(`파일 목록 오류: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load system stats
  const loadStats = useCallback(async () => {
    try {
      const data = await api.getSystemStats();
      setStats(data);
    } catch (err) {
      console.warn('System stats fetch error:', err);
    }
  }, []);

  // Replace initial state so the first page entry has history state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialStorage = params.get('storage') || activeStorageId;
    const initialPath = params.get('path') || currentPath;
    const initialView = (params.get('view') as any) || viewMode;
    window.history.replaceState(
      { storageId: initialStorage, path: initialPath, view: initialView },
      '',
      buildUrl(initialStorage, initialPath, initialView)
    );
  }, []);

  // Listen for browser Back/Forward (popstate)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state;
      if (state) {
        if (state.storageId) {
          setActiveStorageId(state.storageId);
        }
        if (state.path !== undefined) {
          setCurrentPath(state.path);
        }
        if (state.view) {
          setViewMode(state.view);
        }
        if (state.play) {
          const itemToPlay = items.find(i => i.name === state.play);
          if (itemToPlay) {
            setActiveMediaItem(itemToPlay);
          }
        } else {
          setActiveMediaItem(null);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [items]);

  // Initial load
  useEffect(() => {
    loadStorages();
    loadStats();
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [loadStorages, loadStats]);

  // Reload files when path or active storage changes
  useEffect(() => {
    if (activeStorageId) {
      loadFiles(currentPath, activeStorageId);
    }
  }, [currentPath, activeStorageId, loadFiles]);

  // Handle URL changes on view mode change
  const handleViewModeChange = (mode: 'grid' | 'list' | 'netflix') => {
    setViewMode(mode);
    window.history.replaceState(
      { storageId: activeStorageId, path: currentPath, view: mode },
      '',
      buildUrl(activeStorageId, currentPath, mode)
    );
  };

  // Handle directory navigation
  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setSelectedPaths(new Set());
    window.history.pushState(
      { storageId: activeStorageId, path, view: viewMode },
      '',
      buildUrl(activeStorageId, path, viewMode)
    );
  };

  // Handle switching active storage
  const handleSelectStorage = (storageId: string) => {
    setActiveStorageId(storageId);
    setCurrentPath('/');
    setSelectedPaths(new Set());
    window.history.pushState(
      { storageId, path: '/', view: viewMode },
      '',
      buildUrl(storageId, '/', viewMode)
    );
  };

  // Handle opening media file
  const handleOpenMedia = (item: FileItem) => {
    setActiveMediaItem(item);
    window.history.pushState(
      { storageId: activeStorageId, path: currentPath, view: viewMode, play: item.name },
      '',
      buildUrl(activeStorageId, currentPath, viewMode, item.name)
    );
  };

  // Handle closing media viewer
  const handleCloseMedia = () => {
    setActiveMediaItem(null);
    window.history.pushState(
      { storageId: activeStorageId, path: currentPath, view: viewMode },
      '',
      buildUrl(activeStorageId, currentPath, viewMode)
    );
  };

  // Handle sort change
  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Copy / Cut / Paste Handlers
  const handleCopyItems = (paths: string[]) => {
    if (paths.length === 0) return;
    setClipboard({
      action: 'copy',
      paths,
      storageId: activeStorageId,
      storageName: activeStorage?.name || '저장소',
    });
    showToast(`${paths.length}개 항목이 클립보드에 복사되었습니다.`, 'success');
  };

  const handleCutItems = (paths: string[]) => {
    if (paths.length === 0) return;
    setClipboard({
      action: 'cut',
      paths,
      storageId: activeStorageId,
      storageName: activeStorage?.name || '저장소',
    });
    showToast(`${paths.length}개 항목이 잘라내기되었습니다. 이동할 폴더에서 붙여넣으세요.`, 'info');
  };

  const handlePaste = async () => {
    if (!clipboard || clipboard.paths.length === 0) return;
    try {
      if (clipboard.action === 'copy') {
        const res = await api.copyItems(clipboard.paths, currentPath, clipboard.storageId, activeStorageId);
        showToast(`${res.copied}개 항목이 복사되었습니다.`, 'success');
      } else {
        const res = await api.moveItems(clipboard.paths, currentPath, clipboard.storageId, activeStorageId);
        showToast(`${res.moved}개 항목이 이동되었습니다.`, 'success');
        setClipboard(null); // Clear cut clipboard after move
      }
      loadFiles(currentPath, activeStorageId);
      loadStorages();
    } catch (err: any) {
      showToast(`붙여넣기 실패: ${err.message}`, 'error');
    }
  };

  // Single Item Delete
  const handleDeleteSingle = async (item: FileItem) => {
    if (!confirm(`'${item.name}' 항목을 영구 삭제하시겠습니까?`)) return;
    try {
      await api.deleteItems([item.path], activeStorageId);
      showToast(`'${item.name}'이(가) 삭제되었습니다.`, 'success');
      loadFiles(currentPath, activeStorageId);
      loadStorages();
    } catch (err: any) {
      showToast(`삭제 실패: ${err.message}`, 'error');
    }
  };

  // Multiple Items Delete
  const handleDeleteSelected = async () => {
    if (selectedPaths.size === 0) return;
    if (!confirm(`선택한 ${selectedPaths.size}개의 항목을 삭제하시겠습니까? (복구할 수 없습니다)`)) return;
    try {
      await api.deleteItems(Array.from(selectedPaths), activeStorageId);
      showToast(`${selectedPaths.size}개 항목이 삭제되었습니다.`, 'success');
      loadFiles(currentPath, activeStorageId);
      loadStorages();
    } catch (err: any) {
      showToast(`삭제 실패: ${err.message}`, 'error');
    }
  };

  // Toggle selection
  const handleToggleSelect = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Create folder
  const handleCreateFolder = async (name: string) => {
    try {
      await api.createFolder(currentPath, name, activeStorageId);
      setIsNewFolderOpen(false);
      showToast(`새 폴더 '${name}'을(를) 생성했습니다.`, 'success');
      loadFiles(currentPath, activeStorageId);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Rename item
  const handleRename = async (newName: string) => {
    if (!renameTarget) return;
    try {
      await api.renameItem(renameTarget.path, newName, activeStorageId);
      setRenameTarget(null);
      showToast(`'${newName}'(으)로 이름이 변경되었습니다.`, 'success');
      loadFiles(currentPath, activeStorageId);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Upload files
  const handleUpload = async (files: File[]) => {
    setIsUploadOpen(false);
    setUploadProgress({ percent: 0, label: '업로드 준비 중...' });
    try {
      await api.uploadFiles(currentPath, files, activeStorageId, (percent, label) => {
        setUploadProgress({ percent, label });
      });
      showToast(`${files.length}개 파일 업로드 완료!`, 'success');
      loadFiles(currentPath, activeStorageId);
      loadStorages();
    } catch (err: any) {
      showToast(`업로드 실패: ${err.message}`, 'error');
    } finally {
      setTimeout(() => setUploadProgress(null), 1500);
    }
  };

  // Global Drag & Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      await handleUpload(files);
    }
  };

  // Keyboard Shortcuts (Cmd/Ctrl + C, X, V, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key === 'c' && selectedPaths.size > 0) {
        e.preventDefault();
        handleCopyItems(Array.from(selectedPaths));
      } else if (isCmdOrCtrl && e.key === 'x' && selectedPaths.size > 0) {
        e.preventDefault();
        handleCutItems(Array.from(selectedPaths));
      } else if (isCmdOrCtrl && e.key === 'v' && clipboard) {
        e.preventDefault();
        handlePaste();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPaths.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPaths, clipboard, currentPath, activeStorageId]);

  // Context Menu handlers
  const handleItemContextMenu = (e: React.MouseEvent, item: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      item,
    });
  };

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      item: null,
    });
  };

  // Filtered, searched, and sorted items
  const sortedItems = useMemo(() => {
    // 1. Filter
    const filtered = items.filter(item => {
      if (currentFilter !== 'all' && !item.isDir && item.mediaType !== currentFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        return item.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });

    // 2. Sort (Directories always first)
    return filtered.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;

      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'date':
          comparison = new Date(a.modTime).getTime() - new Date(b.modTime).getTime();
          break;
        case 'type':
          comparison = (a.ext || a.mediaType).localeCompare(b.ext || b.mediaType);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [items, currentFilter, searchQuery, sortField, sortOrder]);

  return (
    <div 
      className="flex flex-col h-screen w-screen bg-[#121217] overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Top Header */}
      <Header
        stats={stats}
        activeStorage={activeStorage}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onRefresh={() => loadFiles(currentPath, activeStorageId)}
        isRefreshing={isLoading}
        hasVideos={hasVideos}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
      />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar (Hide in Netflix View for full immersion, or keep compact) */}
        {viewMode !== 'netflix' && (
          <Sidebar
            storages={storages}
            activeStorageId={activeStorageId}
            onSelectStorage={handleSelectStorage}
            currentFilter={currentFilter}
            onSelectFilter={setCurrentFilter}
            stats={stats}
          />
        )}

        {/* Content View: Netflix View or Standard FileList */}
        {viewMode === 'netflix' ? (
          <NetflixView
            items={sortedItems}
            currentPath={currentPath}
            storageId={activeStorageId}
            storageName={activeStorage?.name || '저장소'}
            onNavigate={handleNavigate}
            onOpenMedia={handleOpenMedia}
            onExitNetflixView={() => handleViewModeChange('grid')}
            onShowDetails={setDetailItem}
            onRename={setRenameTarget}
            onDeleteSingle={handleDeleteSingle}
            onCopySingle={(item) => handleCopyItems([item.path])}
            onCutSingle={(item) => handleCutItems([item.path])}
            onContextMenu={handleItemContextMenu}
          />
        ) : (
          <FileList
            items={sortedItems}
            currentPath={currentPath}
            storageId={activeStorageId}
            storageName={activeStorage?.name || '저장소'}
            onNavigate={handleNavigate}
            viewMode={viewMode}
            selectedPaths={selectedPaths}
            onToggleSelect={handleToggleSelect}
            onSelectAll={() => setSelectedPaths(new Set(items.map(i => i.path)))}
            onClearSelection={() => setSelectedPaths(new Set())}
            onOpenMedia={handleOpenMedia}
            onNewFolder={() => setIsNewFolderOpen(true)}
            onUploadClick={() => setIsUploadOpen(true)}
            onRename={setRenameTarget}
            onDeleteSelected={handleDeleteSelected}
            onDeleteSingle={handleDeleteSingle}
            onShowDetails={setDetailItem}
            clipboard={clipboard}
            onCopySelected={() => handleCopyItems(Array.from(selectedPaths))}
            onCutSelected={() => handleCutItems(Array.from(selectedPaths))}
            onPaste={handlePaste}
            onCopyItem={(item) => handleCopyItems([item.path])}
            onCutItem={(item) => handleCutItems([item.path])}
            onItemContextMenu={handleItemContextMenu}
            onBackgroundContextMenu={handleBackgroundContextMenu}
            hasVideos={hasVideos}
            onSwitchToNetflix={() => handleViewModeChange('netflix')}
            sortField={sortField}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
          />
        )}
      </div>

      {/* Global Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-blue-600/20 backdrop-blur-sm border-4 border-dashed border-blue-500 m-4 rounded-3xl flex flex-col items-center justify-center pointer-events-none animate-fadeIn">
          <UploadCloud className="w-16 h-16 text-blue-400 mb-2 animate-bounce" />
          <h2 className="text-xl font-bold text-white">여기에 파일을 드롭하여 업로드</h2>
          <p className="text-sm text-blue-200 mt-1">
            저장소: [{activeStorage?.name}] {currentPath}
          </p>
        </div>
      )}

      {/* Upload Progress Bar Toast */}
      {uploadProgress && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1c1c27] border border-[#2e2e40] rounded-xl p-4 shadow-2xl max-w-sm w-full animate-slideUp">
          <div className="flex justify-between items-center text-xs text-gray-300 mb-2">
            <span className="font-medium truncate max-w-[200px]">{uploadProgress.label}</span>
            <span className="font-mono text-blue-400 font-bold">{uploadProgress.percent}%</span>
          </div>
          <div className="w-full h-2 bg-[#2a2a3b] rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-150"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Status Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-6 left-6 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-2.5 text-xs font-medium animate-slideUp ${
          toastMessage.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-700/60 text-emerald-200'
            : toastMessage.type === 'error'
            ? 'bg-red-950/90 border-red-700/60 text-red-200'
            : 'bg-[#1c1c2b]/95 border-[#303046] text-gray-200'
        }`}>
          {toastMessage.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
          {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
          <span>{toastMessage.text}</span>
          <button 
            onClick={() => setToastMessage(null)}
            className="ml-2 p-0.5 text-gray-400 hover:text-white rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          targetItem={contextMenu.item}
          clipboard={clipboard}
          onClose={() => setContextMenu(null)}
          onOpen={(item) => {
            if (item.isDir) handleNavigate(item.path);
            else handleOpenMedia(item);
          }}
          onDownload={(item) => {
            window.location.href = api.getDownloadUrl(item.path, activeStorageId);
          }}
          onCopy={(item) => handleCopyItems([item.path])}
          onCut={(item) => handleCutItems([item.path])}
          onPaste={handlePaste}
          onRename={(item) => setRenameTarget(item)}
          onDelete={handleDeleteSingle}
          onDetails={(item) => setDetailItem(item)}
          onNewFolder={() => setIsNewFolderOpen(true)}
          onUpload={() => setIsUploadOpen(true)}
          onRefresh={() => loadFiles(currentPath, activeStorageId)}
        />
      )}

      {/* File Details Modal */}
      <FileDetailsModal
        item={detailItem}
        storageId={activeStorageId}
        storageName={activeStorage?.name || '저장소'}
        onClose={() => setDetailItem(null)}
        onOpenMedia={handleOpenMedia}
      />

      {/* Media Viewer */}
      <MediaViewer 
        item={activeMediaItem} 
        storageId={activeStorageId}
        onClose={handleCloseMedia}
        items={sortedItems}
        onNavigateMedia={handleOpenMedia}
      />

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUpload={handleUpload}
        targetPath={`${activeStorage?.name || '저장소'}:${currentPath}`}
      />

      {/* New Folder Modal */}
      <NewFolderModal
        isOpen={isNewFolderOpen}
        onClose={() => setIsNewFolderOpen(false)}
        onCreate={handleCreateFolder}
      />

      {/* Rename Modal */}
      <RenameModal
        item={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={handleRename}
      />
    </div>
  );
};
export default App;
