import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { FileList } from './components/FileList';
import { MediaViewer } from './components/MediaViewer';
import { UploadModal } from './components/UploadModal';
import { NewFolderModal } from './components/NewFolderModal';
import { RenameModal } from './components/RenameModal';
import { FileDetailsModal } from './components/FileDetailsModal';
import { MoveModal } from './components/MoveModal';
import { ContextMenu } from './components/ContextMenu';
import { TrashView } from './components/TrashView';
import { SitesHubView } from './components/SitesHubView';
import { CinemaHubView } from './components/CinemaHubView';
import { PhotosHubView } from './components/PhotosHubView';
import { MusicHubView } from './components/MusicHubView';
import { GlobalAudioPlayer } from './components/GlobalAudioPlayer';
import { FileItem, SystemStats, StorageInfo, SortField, SortOrder, ClipboardItem, NavTab, ThemeStyle, ThemeTone, FontSizeMode, AudioTrack } from './types';
import { api } from './api';
import { UploadCloud, CheckCircle, AlertCircle, X, Clipboard, ArrowRight } from 'lucide-react';
import { getFilesFromDataTransfer, UploadFileEntry } from './utils/fileSystem';

export const App: React.FC = () => {
  // Theme style & tone state
  const [themeStyle, setThemeStyle] = useState<ThemeStyle>(() => {
    const saved = localStorage.getItem('mininas_theme_style') as ThemeStyle;
    if (saved === 'macos' || saved === 'console' || saved === 'studio') return saved;
    const old = localStorage.getItem('mininas_theme');
    if (old === 'console' || old === 'studio') return old;
    return 'macos';
  });

  const [themeTone, setThemeTone] = useState<ThemeTone>(() => {
    const saved = localStorage.getItem('mininas_theme_tone') as ThemeTone;
    if (saved === 'dark' || saved === 'night' || saved === 'light') return saved;
    const old = localStorage.getItem('mininas_theme');
    if (old === 'light') return 'light';
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.remove(
      'theme-macos', 'theme-console', 'theme-studio', 'theme-light',
      'tone-dark', 'tone-night', 'tone-light'
    );
    document.documentElement.classList.add(`theme-${themeStyle}`, `tone-${themeTone}`);
    localStorage.setItem('mininas_theme_style', themeStyle);
    localStorage.setItem('mininas_theme_tone', themeTone);
  }, [themeStyle, themeTone]);

  // Font size state
  const [fontSize, setFontSize] = useState<FontSizeMode>(() => {
    return (localStorage.getItem('mininas_fontsize') as FontSizeMode) || 'medium';
  });

  useEffect(() => {
    document.documentElement.classList.remove('font-size-small', 'font-size-medium', 'font-size-large');
    document.documentElement.classList.add(`font-size-${fontSize}`);
    localStorage.setItem('mininas_fontsize', fontSize);
  }, [fontSize]);

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

  // Active Hub & Search & ViewMode
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab') as NavTab;
    if (t === 'cinema' || t === 'photos' || t === 'sites' || t === 'trash') return t;
    return 'files';
  });
  const [returnBanner, setReturnBanner] = useState<{ fromTab: NavTab; label: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    return v === 'list' ? 'list' : 'grid';
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
  const [cinemaPlaylist, setCinemaPlaylist] = useState<FileItem[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [detailItem, setDetailItem] = useState<FileItem | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveSourcePaths, setMoveSourcePaths] = useState<string[]>([]);

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
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Global Audio Player state
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [audioPlaylist, setAudioPlaylist] = useState<AudioTrack[]>([]);

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

  // Build URL helper
  const buildUrl = (storageId: string, path: string, view: string = viewMode, playName?: string, tab: NavTab = activeTab) => {
    const params = new URLSearchParams();
    if (tab && tab !== 'files') params.set('tab', tab);
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

  // Load files (Current directory explorer with Auto-Fallback to root)
  const loadFiles = useCallback(async (path: string, storageId: string) => {
    setIsLoading(true);
    try {
      const data = await api.getFiles(path, storageId);
      setItems(data.items);
      setSelectedPaths(new Set());
    } catch (err: any) {
      // If requested subfolder does not exist (e.g. stale URL), automatically fallback to root '/'
      if (path && path !== '/') {
        showToast('폴더가 존재하지 않아 루트로 이동합니다.', 'info');
        setCurrentPath('/');
        window.history.replaceState(
          { tab: 'files', storageId, path: '/', view: viewMode },
          '',
          buildUrl(storageId, '/', viewMode, undefined, 'files')
        );
        try {
          const rootData = await api.getFiles('/', storageId);
          setItems(rootData.items);
          setSelectedPaths(new Set());
        } catch (rootErr: any) {
          showToast(`파일 목록 오류: ${rootErr.message}`, 'error');
        }
        return;
      }
      showToast(`파일 목록 오류: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [viewMode]);

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
    const initialTab = (params.get('tab') as NavTab) || activeTab;
    window.history.replaceState(
      { tab: initialTab, storageId: initialStorage, path: initialPath, view: initialView },
      '',
      buildUrl(initialStorage, initialPath, initialView, undefined, initialTab)
    );
  }, []);

  // Listen for browser Back/Forward (popstate)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state;
      if (state) {
        if (state.tab) {
          setActiveTab(state.tab);
        } else {
          setActiveTab('files');
        }
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
      } else {
        const params = new URLSearchParams(window.location.search);
        const t = (params.get('tab') as NavTab) || 'files';
        setActiveTab(t);
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
  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    window.history.replaceState(
      { storageId: activeStorageId, path: currentPath, view: mode },
      '',
      buildUrl(activeStorageId, currentPath, mode)
    );
  };

  // Handle switching active tab/hub
  const handleSelectTab = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab !== 'files') {
      setReturnBanner(null);
    }
    window.history.pushState(
      { tab, storageId: activeStorageId, path: currentPath, view: viewMode },
      '',
      buildUrl(activeStorageId, currentPath, viewMode, undefined, tab)
    );
  };

  // Handle directory navigation
  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setSelectedPaths(new Set());
    window.history.pushState(
      { tab: 'files', storageId: activeStorageId, path, view: viewMode },
      '',
      buildUrl(activeStorageId, path, viewMode, undefined, 'files')
    );
  };

  // Handle cross-storage navigation
  const handleNavigateToStorage = (storageId: string, path: string = '/', fromHub?: { tab: NavTab; label: string }) => {
    setActiveTab('files');
    if (fromHub) {
      setReturnBanner({ fromTab: fromHub.tab, label: fromHub.label });
    }
    setActiveStorageId(storageId);
    setCurrentPath(path);
    setSelectedPaths(new Set());
    loadFiles(path, storageId);
    window.history.pushState(
      { tab: 'files', storageId, path, view: viewMode },
      '',
      buildUrl(storageId, path, viewMode, undefined, 'files')
    );
  };

  // Handle switching active storage
  const handleSelectStorage = (storageId: string) => {
    setActiveTab('files');
    setReturnBanner(null);
    setSearchQuery('');
    setActiveStorageId(storageId);
    setCurrentPath('/');
    setSelectedPaths(new Set());
    loadFiles('/', storageId);
    window.history.pushState(
      { tab: 'files', storageId, path: '/', view: viewMode },
      '',
      buildUrl(storageId, '/', viewMode, undefined, 'files')
    );
  };

  // Handle opening media file
  const handleOpenMedia = (item: FileItem) => {
    // If it is an audio file, route to Global Audio Player (persistent background playback)
    if (item.mediaType === 'audio') {
      const audioFiles = sortedItems.filter(i => i.mediaType === 'audio');
      const playlistTracks: AudioTrack[] = audioFiles.map(i => ({
        id: `${activeStorageId}:${i.path}`,
        title: i.name.replace(i.ext, ''),
        path: i.path,
        storageId: activeStorageId,
        storageName: activeStorage?.name,
        size: i.size,
        ext: i.ext,
      }));
      const track: AudioTrack = {
        id: `${activeStorageId}:${item.path}`,
        title: item.name.replace(item.ext, ''),
        path: item.path,
        storageId: activeStorageId,
        storageName: activeStorage?.name,
        size: item.size,
        ext: item.ext,
      };
      setCurrentTrack(track);
      setAudioPlaylist(playlistTracks.length > 0 ? playlistTracks : [track]);
      return;
    }

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
    setCinemaPlaylist([]);
    window.history.pushState(
      { storageId: activeStorageId, path: currentPath, view: viewMode, tab: activeTab },
      '',
      buildUrl(activeStorageId, currentPath, viewMode, undefined, activeTab)
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
    showToast(`${paths.length}개 항목이 잘라내기되었습니다. 이동할 폴더에서 붙여넣거나 ESC로 취소하세요.`, 'info');
  };

  const handleCancelClipboard = () => {
    setClipboard(null);
    showToast('클립보드 작업이 취소되었습니다.', 'info');
  };

  const handleOpenMoveModal = (paths?: string[]) => {
    const targets = paths && paths.length > 0 ? paths : Array.from(selectedPaths);
    if (targets.length === 0) {
      showToast('이동할 항목을 먼저 선택해주세요.', 'error');
      return;
    }
    setMoveSourcePaths(targets);
    setIsMoveModalOpen(true);
  };

  const handleMoveSuccess = (targetDir: string, movedCount: number, targetStorageId?: string) => {
    const targetStorage = storages.find(s => s.id === targetStorageId);
    const storageLabel = targetStorage && targetStorageId !== activeStorageId ? ` [${targetStorage.name}]` : '';
    showToast(`${movedCount}개 항목이${storageLabel} '${targetDir}'(으)로 이동되었습니다.`, 'success');
    setSelectedPaths(new Set());
    setClipboard(null);
    loadFiles(currentPath, activeStorageId);
    loadStorages();
  };

  const handlePaste = async () => {
    if (!clipboard || clipboard.paths.length === 0) return;

    // Check if moving to the same directory
    if (clipboard.action === 'cut' && clipboard.storageId === activeStorageId) {
      const allInSameDir = clipboard.paths.every(p => {
        const parent = p.substring(0, p.lastIndexOf('/')) || '/';
        return parent === currentPath;
      });
      if (allInSameDir) {
        showToast('출발 폴더와 대상 폴더가 동일합니다.', 'error');
        return;
      }
    }

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
    if (!confirm(`'${item.name}' 항목을 휴지통으로 이동하시겠습니까?`)) return;
    try {
      await api.deleteItems([item.path], activeStorageId);
      showToast(`'${item.name}'이(가) 휴지통으로 이동되었습니다.`, 'success');
      loadFiles(currentPath, activeStorageId);
      loadStorages();
    } catch (err: any) {
      showToast(`삭제 실패: ${err.message}`, 'error');
    }
  };

  // Multiple Items Delete
  const handleDeleteSelected = async () => {
    if (selectedPaths.size === 0) return;
    if (!confirm(`선택한 ${selectedPaths.size}개의 항목을 휴지통으로 이동하시겠습니까?`)) return;
    try {
      await api.deleteItems(Array.from(selectedPaths), activeStorageId);
      showToast(`${selectedPaths.size}개 항목이 휴지통으로 이동되었습니다.`, 'success');
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

  // Upload cancel handler
  const handleCancelUpload = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }
  };

  // Upload files or folders
  const handleUpload = async (items: (File | UploadFileEntry)[]) => {
    setIsUploadOpen(false);
    setUploadProgress({ percent: 0, label: '업로드 준비 중...' });
    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;

    try {
      const result = await api.uploadFiles(
        currentPath,
        items,
        activeStorageId,
        (percent, label) => {
          setUploadProgress({ percent, label });
        },
        controller.signal
      );

      if (result.aborted) {
        showToast(`업로드가 취소되었습니다. (${result.completedCount}/${result.totalCount}개 보존됨)`, 'info');
      } else {
        showToast(`${result.completedCount}개 항목 업로드 완료!`, 'success');
      }
      loadFiles(currentPath, activeStorageId);
      loadStorages();
    } catch (err: any) {
      showToast(`업로드 실패: ${err.message}`, 'error');
    } finally {
      uploadAbortControllerRef.current = null;
      setTimeout(() => setUploadProgress(null), 1200);
    }
  };

  // Prevent accidental page reload/exit during active upload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (uploadProgress) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [uploadProgress]);

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

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const entries = await getFilesFromDataTransfer(e.dataTransfer.items);
      if (entries.length > 0) {
        await handleUpload(entries);
        return;
      }
    }

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

      if (isCmdOrCtrl && (e.key === 'a' || e.key === 'A') && activeTab === 'files' && items.length > 0) {
        e.preventDefault();
        if (selectedPaths.size === items.length) {
          setSelectedPaths(new Set());
        } else {
          setSelectedPaths(new Set(items.map(i => i.path)));
        }
        return;
      }

      if (e.key === 'Escape') {
        if (clipboard) {
          e.preventDefault();
          handleCancelClipboard();
        } else if (selectedPaths.size > 0) {
          e.preventDefault();
          setSelectedPaths(new Set());
        }
        return;
      }

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
  }, [selectedPaths, clipboard, currentPath, activeStorageId, items, activeTab]);

  // Context Menu handlers
  const handlePinToSites = async (item: FileItem) => {
    try {
      await api.pinSite(activeStorageId, item.path);
      showToast(`'${item.name}' 항목이 사이트 허브에 고정되었습니다.`, 'success');
    } catch (err: any) {
      showToast(`사이트 고정 실패: ${err.message}`, 'error');
    }
  };

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
    // 1. Search Query (Quick inline filter)
    const filtered = items.filter(item => {
      if (searchQuery.trim() && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
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
  }, [items, searchQuery, sortField, sortOrder]);

  return (
    <div 
      className="flex flex-col h-screen h-[100dvh] w-screen bg-surface-base text-content-primary overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onRefresh={() => loadFiles(currentPath, activeStorageId)}
        isRefreshing={isLoading}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
        onToggleSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
      />

      {/* Main Body */}
      <div className={`flex-1 flex overflow-hidden relative ${currentTrack ? 'pb-[70px]' : ''}`}>
        {/* Mobile Backdrop */}
        {isMobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar Container: Fixed Drawer on Mobile, Relative Flex Column on Desktop */}
        <div className={`
          ${isMobileSidebarOpen ? 'fixed inset-y-0 left-0 z-50 flex shadow-2xl animate-slideRight max-h-[100dvh] overflow-hidden' : 'hidden'}
          md:relative md:z-0 md:flex h-full
        `}>
          <Sidebar
            storages={storages}
            activeStorageId={activeStorageId}
            onSelectStorage={handleSelectStorage}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            stats={stats}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
            themeStyle={themeStyle}
            onSelectThemeStyle={setThemeStyle}
            themeTone={themeTone}
            onSelectThemeTone={setThemeTone}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
          />
        </div>

        {/* Content View: Trash View, Cinema Hub, Photos Hub, Sites Hub, Netflix View or Standard FileList */}
        {activeTab === 'trash' ? (
          <TrashView
            storages={storages}
            activeStorageId={activeStorageId}
            onShowToast={showToast}
            onRefreshStorages={loadStorages}
          />
        ) : activeTab === 'cinema' ? (
          <CinemaHubView
            storages={storages}
            onPlayMovie={(item, sId, playlist) => {
              setActiveStorageId(sId);
              setCinemaPlaylist(playlist);
              setActiveMediaItem(item);
            }}
            onNavigateToStorage={(sId, path) => {
              handleNavigateToStorage(sId, path, { tab: 'cinema', label: '시네마 (Cinema)' });
            }}
            onShowToast={showToast}
          />
        ) : activeTab === 'photos' ? (
          <PhotosHubView
            storages={storages}
            onOpenPhoto={(item, sId, playlist) => {
              setActiveStorageId(sId);
              setCinemaPlaylist(playlist);
              setActiveMediaItem(item);
            }}
            onShowToast={showToast}
          />
        ) : activeTab === 'music' ? (
          <MusicHubView
            storages={storages}
            onPlayTrack={(track, playlist) => {
              setCurrentTrack({ ...track });
              setAudioPlaylist(playlist);
            }}
            currentTrackId={currentTrack?.id}
            onNavigateToStorage={(sId, path) => {
              handleNavigateToStorage(sId, path, { tab: 'music', label: '음악 (Music)' });
            }}
            onShowToast={showToast}
          />
        ) : activeTab === 'sites' ? (
          <SitesHubView
            storages={storages}
            onNavigateToStorage={(sId, path) => {
              handleNavigateToStorage(sId, path, { tab: 'sites', label: '웹 사이트 (Sites)' });
            }}
            onShowToast={showToast}
          />
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {returnBanner && (
              <div className="bg-surface-card border-b border-surface-border px-4 py-2 flex items-center justify-between text-xs text-content-secondary z-10 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span>
                    <strong className="text-content-primary font-medium">{returnBanner.label}</strong>에서 이동한 폴더입니다.
                  </span>
                </div>
                <button
                  onClick={() => {
                    handleSelectTab(returnBanner.fromTab);
                    setReturnBanner(null);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-base hover:bg-surface-cardHover text-content-primary border border-surface-border text-xs transition"
                >
                  <ArrowRight className="w-3 h-3 rotate-180" />
                  <span>{returnBanner.label}로 돌아가기</span>
                </button>
              </div>
            )}
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
              onOpenMoveModal={() => handleOpenMoveModal()}
              onPaste={handlePaste}
              onCancelClipboard={handleCancelClipboard}
              onCopyItem={(item) => handleCopyItems([item.path])}
              onCutItem={(item) => handleCutItems([item.path])}
              onItemContextMenu={handleItemContextMenu}
              onBackgroundContextMenu={handleBackgroundContextMenu}
              sortField={sortField}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
            />
          </div>
        )}
      </div>

      {/* Active Floating Clipboard Bar (Always visible when Cut / Copy is active) */}
      {clipboard && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-[#1e1e2d]/95 border border-amber-500/50 text-amber-200 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs animate-slideDown backdrop-blur-md">
          <div className="flex items-center gap-2 font-semibold">
            <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400">
              {clipboard.action === 'cut' ? <ArrowRight className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
            </span>
            <span>
              {clipboard.action === 'cut' ? '이동(잘라내기) 대기 중' : '복사 대기 중'}:{' '}
              <strong className="text-white">{clipboard.paths.length}개 항목</strong>
            </span>
          </div>

          <div className="h-4 w-px bg-white/10" />

          <button
            onClick={handlePaste}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition active:scale-95 shadow-md shadow-amber-500/20"
            title="현재 열린 폴더로 이동/복사"
          >
            현재 폴더로 {clipboard.action === 'cut' ? '이동' : '복사'}
          </button>

          <button
            onClick={handleCancelClipboard}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-[#28283a] hover:bg-[#34344d] text-gray-300 hover:text-white rounded-xl transition"
            title="클립보드 작업 취소 (ESC)"
          >
            <X className="w-3.5 h-3.5" />
            <span>취소 (ESC)</span>
          </button>
        </div>
      )}

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
        <div className="fixed bottom-6 right-6 z-50 bg-surface-card border border-surface-border rounded-xl p-4 shadow-2xl max-w-sm w-full animate-slideUp text-content-primary">
          <div className="flex justify-between items-center text-xs mb-2 gap-2">
            <span className="font-medium truncate max-w-[200px] text-content-secondary">{uploadProgress.label}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-accent font-bold">{uploadProgress.percent}%</span>
              <button
                onClick={handleCancelUpload}
                className="px-2 py-0.5 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition font-medium border border-red-500/20"
                title="업로드 즉시 취소"
              >
                취소
              </button>
            </div>
          </div>
          <div className="w-full h-2 bg-surface-base border border-surface-borderSubtle rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-150"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Status Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-5 left-5 z-50 px-3.5 py-2.5 rounded-md border shadow-lg flex items-center gap-2 text-xs font-normal ${
          toastMessage.type === 'success'
            ? 'bg-surface-card border-surface-border text-content-primary'
            : toastMessage.type === 'error'
            ? 'bg-surface-card border-red-500/40 text-red-300'
            : 'bg-surface-card border-surface-border text-content-primary'
        }`}>
          {toastMessage.type === 'success' && <CheckCircle className="w-3.5 h-3.5 text-accent shrink-0" />}
          {toastMessage.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
          <span>{toastMessage.text}</span>
          <button 
            onClick={() => setToastMessage(null)}
            className="ml-2 p-0.5 text-content-muted hover:text-content-primary rounded"
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
          onPinToSites={handlePinToSites}
          onDownload={(item) => {
            window.location.href = api.getDownloadUrl(item.path, activeStorageId);
          }}
          onCopy={(item) => handleCopyItems([item.path])}
          onCut={(item) => handleCutItems([item.path])}
          onMoveTo={(item) => handleOpenMoveModal([item.path])}
          onPaste={handlePaste}
          onCancelClipboard={handleCancelClipboard}
          onRename={(item) => setRenameTarget(item)}
          onDelete={handleDeleteSingle}
          onDetails={(item) => setDetailItem(item)}
          onNewFolder={() => setIsNewFolderOpen(true)}
          onUpload={() => setIsUploadOpen(true)}
          onRefresh={() => loadFiles(currentPath, activeStorageId)}
        />
      )}

      {/* Move Folder Modal */}
      <MoveModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        sourcePaths={moveSourcePaths}
        storages={storages}
        currentStorageId={activeStorageId}
        onMoveSuccess={handleMoveSuccess}
      />

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
        items={cinemaPlaylist.length > 0 ? cinemaPlaylist : sortedItems}
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

      {/* Global Background Audio Player */}
      <GlobalAudioPlayer
        currentTrack={currentTrack}
        playlist={audioPlaylist}
        onTrackChange={(track) => setCurrentTrack(track)}
        onClose={() => setCurrentTrack(null)}
      />
    </div>
  );
};
export default App;
