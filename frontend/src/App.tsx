import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { FileList } from './components/FileList';
import { MediaViewer } from './components/MediaViewer';
import { UploadModal } from './components/UploadModal';
import { NewFolderModal } from './components/NewFolderModal';
import { RenameModal } from './components/RenameModal';
import { FileItem, SystemStats, StorageInfo } from './types';
import { api } from './api';
import { UploadCloud } from 'lucide-react';

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

  // Filters & Search
  const [currentFilter, setCurrentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Selection
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Modals & Viewers
  const [activeMediaItem, setActiveMediaItem] = useState<FileItem | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);

  // Drag & drop upload state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; label: string } | null>(null);

  // Active storage object
  const activeStorage = useMemo(() => {
    return storages.find(s => s.id === activeStorageId) || storages[0] || null;
  }, [storages, activeStorageId]);

  // Build URL helper
  const buildUrl = (storageId: string, path: string, playName?: string) => {
    const params = new URLSearchParams();
    if (storageId) params.set('storage', storageId);
    if (path && path !== '/') params.set('path', path);
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
      alert(`파일 목록을 불러오는 중 오류가 발생했습니다: ${err.message}`);
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
    window.history.replaceState(
      { storageId: initialStorage, path: initialPath },
      '',
      buildUrl(initialStorage, initialPath)
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
        if (state.mediaItem) {
          setActiveMediaItem(state.mediaItem);
        } else {
          setActiveMediaItem(null);
        }
      } else {
        const params = new URLSearchParams(window.location.search);
        const urlStorage = params.get('storage');
        const urlPath = params.get('path') || '/';
        if (urlStorage) setActiveStorageId(urlStorage);
        setCurrentPath(urlPath);
        setActiveMediaItem(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    loadStorages();
  }, [loadStorages]);

  useEffect(() => {
    if (activeStorageId) {
      loadFiles(currentPath, activeStorageId);
    }
  }, [currentPath, activeStorageId, loadFiles]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(() => {
      loadStats();
      loadStorages();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadStats, loadStorages]);

  // Storage switch
  const handleSelectStorage = (id: string) => {
    if (id !== activeStorageId) {
      setActiveStorageId(id);
      setCurrentPath('/');
      window.history.pushState(
        { storageId: id, path: '/' },
        '',
        buildUrl(id, '/')
      );
    }
  };

  // Navigate folder
  const handleNavigate = (path: string) => {
    if (path !== currentPath) {
      setCurrentPath(path);
      window.history.pushState(
        { storageId: activeStorageId, path },
        '',
        buildUrl(activeStorageId, path)
      );
    }
  };

  // Media open & close with browser history
  const handleOpenMedia = (item: FileItem) => {
    setActiveMediaItem(item);
    window.history.pushState(
      { storageId: activeStorageId, path: currentPath, mediaItem: item },
      '',
      buildUrl(activeStorageId, currentPath, item.name)
    );
  };

  const handleCloseMedia = () => {
    if (window.history.state && window.history.state.mediaItem) {
      window.history.back();
    } else {
      setActiveMediaItem(null);
      window.history.replaceState(
        { storageId: activeStorageId, path: currentPath },
        '',
        buildUrl(activeStorageId, currentPath)
      );
    }
  };

  // Upload handler
  const handleUpload = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      await api.uploadFiles(currentPath, files, activeStorageId, (percent, label) => {
        setUploadProgress({ percent, label });
      });
      loadFiles(currentPath, activeStorageId);
      loadStorages();
    } catch (err: any) {
      alert(`업로드 실패: ${err.message}`);
    } finally {
      setUploadProgress(null);
    }
  };

  // Drag & drop on window
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(Array.from(e.dataTransfer.files));
    }
  };

  // Folder creation
  const handleCreateFolder = async (name: string) => {
    try {
      await api.createFolder(currentPath, name, activeStorageId);
      loadFiles(currentPath, activeStorageId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Rename
  const handleRename = async (newName: string) => {
    if (!renameTarget) return;
    try {
      await api.renameItem(renameTarget.path, newName, activeStorageId);
      loadFiles(currentPath, activeStorageId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Delete selected
  const handleDeleteSelected = async () => {
    if (selectedPaths.size === 0) return;
    if (!confirm(`선택한 ${selectedPaths.size}개의 항목을 삭제하시겠습니까? (복구할 수 없습니다)`)) return;
    try {
      await api.deleteItems(Array.from(selectedPaths), activeStorageId);
      loadFiles(currentPath, activeStorageId);
      loadStorages();
    } catch (err: any) {
      alert(err.message);
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

  // Filtered & searched items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (currentFilter !== 'all' && !item.isDir && item.mediaType !== currentFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        return item.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [items, currentFilter, searchQuery]);

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
        onViewModeChange={setViewMode}
        onRefresh={() => loadFiles(currentPath, activeStorageId)}
        isRefreshing={isLoading}
      />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          storages={storages}
          activeStorageId={activeStorageId}
          onSelectStorage={handleSelectStorage}
          currentFilter={currentFilter}
          onSelectFilter={setCurrentFilter}
          stats={stats}
        />
        <FileList
          items={filteredItems}
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
        />
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

      {/* Modals & Media Viewer */}
      <MediaViewer 
        item={activeMediaItem} 
        storageId={activeStorageId}
        onClose={handleCloseMedia} 
      />
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUpload={handleUpload}
        targetPath={`${activeStorage?.name || '저장소'}:${currentPath}`}
      />
      <NewFolderModal
        isOpen={isNewFolderOpen}
        onClose={() => setIsNewFolderOpen(false)}
        onCreate={handleCreateFolder}
      />
      <RenameModal
        item={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={handleRename}
      />
    </div>
  );
};
export default App;
