import { FileItem, SystemStats, StorageInfo, SubtitleTrack, MediaCapabilities, MediaInspection, BatchConvertJob, TrashResponse, SiteItem, CinemaItem, PhotoItem } from './types';

const API_BASE = '/api';

export const api = {
  async getStorages(): Promise<StorageInfo[]> {
    const res = await fetch(`${API_BASE}/storages`);
    if (!res.ok) throw new Error('Failed to fetch storages');
    return res.json();
  },

  async getFiles(
    path: string = '/', 
    storageId: string = '', 
    options?: { recursive?: boolean; type?: string }
  ): Promise<{ currentPath: string; items: FileItem[] }> {
    let url = `${API_BASE}/files?path=${encodeURIComponent(path)}&storage=${encodeURIComponent(storageId)}`;
    if (options?.recursive) {
      url += `&recursive=true`;
    }
    if (options?.type) {
      url += `&type=${encodeURIComponent(options.type)}`;
    }
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch files' }));
      throw new Error(err.error || 'Failed to fetch files');
    }
    return res.json();
  },

  async createFolder(parentPath: string, name: string, storageId: string = ''): Promise<void> {
    const res = await fetch(`${API_BASE}/files/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath, name, storage: storageId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create folder' }));
      throw new Error(err.error || 'Failed to create folder');
    }
  },

  async renameItem(path: string, newName: string, storageId: string = ''): Promise<void> {
    const res = await fetch(`${API_BASE}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, newName, storage: storageId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to rename item' }));
      throw new Error(err.error || 'Failed to rename item');
    }
  },

  async deleteItems(paths: string[], storageId: string = '', permanent: boolean = false): Promise<void> {
    const res = await fetch(`${API_BASE}/files/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, storage: storageId, permanent }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete items' }));
      throw new Error(err.error || 'Failed to delete items');
    }
  },

  async copyItems(sourcePaths: string[], targetDir: string, storageId: string = '', targetStorageId?: string): Promise<{ copied: number }> {
    const res = await fetch(`${API_BASE}/files/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePaths,
        targetDir,
        storage: storageId,
        sourceStorage: storageId,
        targetStorage: targetStorageId || storageId,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to copy items' }));
      throw new Error(err.error || 'Failed to copy items');
    }
    return res.json();
  },

  async moveItems(sourcePaths: string[], targetDir: string, storageId: string = '', targetStorageId?: string): Promise<{ moved: number }> {
    const res = await fetch(`${API_BASE}/files/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePaths,
        targetDir,
        storage: storageId,
        sourceStorage: storageId,
        targetStorage: targetStorageId || storageId,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to move items' }));
      throw new Error(err.error || 'Failed to move items');
    }
    return res.json();
  },

  uploadFiles(
    targetPath: string,
    files: File[],
    storageId: string = '',
    onProgress: (percent: number, currentFile: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('targetPath', targetPath);
      formData.append('storage', storageId);
      files.forEach(f => formData.append('files', f));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/files/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent, files.length > 1 ? `${files.length}개 파일 업로드 중...` : files[0].name);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error || 'Upload failed'));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });
  },

  getDownloadUrl(path: string, storageId: string = ''): string {
    return `${API_BASE}/files/download?path=${encodeURIComponent(path)}&storage=${encodeURIComponent(storageId)}`;
  },

  getZipDownloadUrl(paths: string[], storageId: string = ''): string {
    const query = paths.map(p => `path=${encodeURIComponent(p)}`).join('&');
    return `${API_BASE}/files/download-zip?${query}&storage=${encodeURIComponent(storageId)}`;
  },

  getStreamUrl(path: string, storageId: string = ''): string {
    return `${API_BASE}/files/stream?path=${encodeURIComponent(path)}&storage=${encodeURIComponent(storageId)}`;
  },

  getHostUrl(path: string, storageId: string = ''): string {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const targetStorage = storageId || 'main';
    return `/sites/${targetStorage}${cleanPath}`;
  },

  async getSubtitles(path: string, storageId: string = ''): Promise<SubtitleTrack[]> {
    try {
      const res = await fetch(`${API_BASE}/files/subtitles?path=${encodeURIComponent(path)}&storage=${encodeURIComponent(storageId)}`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async getMediaCapabilities(): Promise<MediaCapabilities> {
    try {
      const res = await fetch(`${API_BASE}/media/capabilities`);
      if (!res.ok) return { available: false, tool: '', path: '' };
      return await res.json();
    } catch {
      return { available: false, tool: '', path: '' };
    }
  },

  async inspectMedia(path: string, storageId: string = ''): Promise<MediaInspection | null> {
    try {
      const res = await fetch(`${API_BASE}/media/inspect?path=${encodeURIComponent(path)}&storage=${encodeURIComponent(storageId)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async startBatchConvert(options: {
    storage: string;
    path: string;
    extractSubtitles: boolean;
    convertAudio: boolean;
    replaceOriginal: boolean;
  }): Promise<BatchConvertJob> {
    const res = await fetch(`${API_BASE}/media/batch-convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '변환 요청 실패' }));
      throw new Error(err.error || '변환 요청 실패');
    }
    return await res.json();
  },

  async getBatchConvertStatus(jobId: string): Promise<BatchConvertJob> {
    const res = await fetch(`${API_BASE}/media/batch-convert/status?jobId=${encodeURIComponent(jobId)}`);
    if (!res.ok) throw new Error('작업 상태 조회 실패');
    return await res.json();
  },

  async getSystemStats(): Promise<SystemStats> {
    const res = await fetch(`${API_BASE}/system/stats`);
    if (!res.ok) throw new Error('Failed to fetch system stats');
    return res.json();
  },

  async getTrash(storageId: string = ''): Promise<TrashResponse> {
    const res = await fetch(`${API_BASE}/trash?storage=${encodeURIComponent(storageId)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '휴지통 조회 실패' }));
      throw new Error(err.error || '휴지통 조회 실패');
    }
    return res.json();
  },

  async restoreTrash(ids: string[], storageId: string = ''): Promise<{ restored: number }> {
    const res = await fetch(`${API_BASE}/trash/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, storage: storageId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '복구 실패' }));
      throw new Error(err.error || '복구 실패');
    }
    return res.json();
  },

  async deleteTrashPermanently(ids: string[], storageId: string = ''): Promise<{ deleted: number }> {
    const res = await fetch(`${API_BASE}/trash/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, storage: storageId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '영구 삭제 실패' }));
      throw new Error(err.error || '영구 삭제 실패');
    }
    return res.json();
  },

  async emptyTrash(storageId: string = ''): Promise<void> {
    const res = await fetch(`${API_BASE}/trash/empty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storage: storageId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '휴지통 비우기 실패' }));
      throw new Error(err.error || '휴지통 비우기 실패');
    }
  },

  async getSites(): Promise<SiteItem[]> {
    const res = await fetch(`${API_BASE}/sites`);
    if (!res.ok) {
      throw new Error('Failed to fetch sites');
    }
    return res.json();
  },

  async pinSite(storageId: string, path: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sites/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storage: storageId, path }),
    });
    if (!res.ok) {
      throw new Error('사이트 핀 고정 실패');
    }
  },

  async unpinSite(storageId: string, path: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sites/unpin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storage: storageId, path }),
    });
    if (!res.ok) {
      throw new Error('사이트 핀 고정 해제 실패');
    }
  },

  async getCinemaVideos(storageId?: string): Promise<CinemaItem[]> {
    const url = storageId ? `${API_BASE}/cinema?storage=${encodeURIComponent(storageId)}` : `${API_BASE}/cinema`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('영화/영상 라이브러리 로드 실패');
    }
    return res.json();
  },

  async getPhotos(storageId?: string, typeFilter?: string, skipSpecial?: boolean): Promise<PhotoItem[]> {
    const params = new URLSearchParams();
    if (storageId && storageId !== 'all') params.set('storage', storageId);
    if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
    if (skipSpecial) params.set('skip_special', 'true');
    const qs = params.toString();
    const url = qs ? `${API_BASE}/photos?${qs}` : `${API_BASE}/photos`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('사진 & 모먼트 로드 실패');
    }
    return res.json();
  }
};
