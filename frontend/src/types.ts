export type NavTab = 'files' | 'cinema' | 'photos' | 'sites' | 'trash';
export type MediaFilter = 'all' | 'image' | 'video';

export interface StorageInfo {
  id: string;
  name: string;
  path: string;
  disk: {
    mountPoint: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
}

export interface FileItem {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: string;
  ext: string;
  mediaType: 'image' | 'video' | 'audio' | 'text' | 'archive' | 'other';
}

export interface SystemStats {
  hostname: string;
  os: string;
  uptimeSeconds: number;
  cpuPercent: number;
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
  disk: {
    mountPoint: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface SubtitleTrack {
  label: string;
  language: string;
  format: string;
  path: string;
  url: string;
}

export interface MediaCapabilities {
  available: boolean;
  tool: string;
  path: string;
}

export interface MediaInspection {
  path: string;
  filename: string;
  videoCodec: string;
  audioCodec: string;
  hasWebCompatibleAudio: boolean;
  hasWebCompatibleVideo: boolean;
  hasExternalSubtitle: boolean;
  embeddedSubtitles: SubtitleTrack[];
  hasKoreanSubtitle: boolean;
  needsConversion: boolean;
  reason: string;
  reasons?: string[];
}

export interface BatchConvertJob {
  id: string;
  status: 'running' | 'completed' | 'failed';
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  percent: number;
  createdAt: string;
  completedAt?: string;
  errors?: string[];
}

export type SortField = 'name' | 'size' | 'date' | 'type';
export type SortOrder = 'asc' | 'desc';

export interface ClipboardItem {
  action: 'copy' | 'cut';
  paths: string[];
  storageId: string;
  storageName: string;
}

export interface SiteItem {
  id: string;
  title: string;
  storageId: string;
  storageName: string;
  relPath: string;
  url: string;
  isDir: boolean;
  hasIndex?: boolean;
  isPinned?: boolean;
  docCount?: number;
  size: number;
  modTime: string;
}

export interface TrashItem {
  id: string;
  storageId: string;
  originalPath: string;
  name: string;
  trashName: string;
  size: number;
  isDir: boolean;
  deletedAt: string;
}

export interface TrashResponse {
  items: TrashItem[];
  totalSize: number;
  totalCount: number;
}

export interface CinemaItem {
  id: string;
  title: string;
  name: string;
  storageId: string;
  storageName: string;
  relPath: string;
  size: number;
  modTime: string;
  ext: string;
  hasSubtitle: boolean;
}

export interface PhotoItem {
  id: string;
  name: string;
  storageId: string;
  storageName: string;
  relPath: string;
  size: number;
  modTime: string;
  ext: string;
  mediaType: 'image' | 'video';
}



