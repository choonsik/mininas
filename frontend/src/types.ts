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
