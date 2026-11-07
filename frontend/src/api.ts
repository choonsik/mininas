import { FileItem, SystemStats, StorageInfo, SubtitleTrack, MediaCapabilities, MediaInspection, BatchConvertJob } from './types';

const API_BASE = '/api';

export const api = {
  async getStorages(): Promise<StorageInfo[]> {
    const res = await fetch(`${API_BASE}/storages`);
    if (!res.ok) throw new Error('Failed to fetch storages');
    return res.json();
  },

  async getFiles(path: string = '/', storageId: string = ''): Promise<{ currentPath: string; items: FileItem[] }> {
    const res = await fetch(`${API_BASE}/files?path=${encodeURIComponent(path)}&storage=${encodeURIComponent(storageId)}`);
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

  async deleteItems(paths: string[], storageId: string = ''): Promise<void> {
    const res = await fetch(`${API_BASE}/files/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, storage: storageId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete items' }));
      throw new Error(err.error || 'Failed to delete items');
    }
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
    if (!storageId || storageId === 'main') {
      return `/sites${cleanPath}`;
    }
    return `/sites/${storageId}${cleanPath}`;
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
  }
};
