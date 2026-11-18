/**
 * Concurrent Video Thumbnail Processing Queue
 * 1) Checks persistent server-side disk cache (/api/photos/thumb) first for instant <1ms loading.
 * 2) On cache miss, decodes 1 video frame with concurrency limit (max 2) and persists it to server cache.
 */

import { api } from '../api';

type ThumbnailTask = {
  id: string;
  url: string;
  ext: string;
  storageId?: string;
  relPath?: string;
  onSuccess: (dataUrl: string) => void;
  onError: () => void;
};

// Global in-memory cache for thumbnails
const thumbnailCache = new Map<string, string>();

class ThumbnailQueue {
  private queue: ThumbnailTask[] = [];
  private activeCount = 0;
  private readonly maxConcurrent = 2; // Maximum concurrent video decoder instances

  public getCached(key: string): string | undefined {
    return thumbnailCache.get(key);
  }

  public enqueue(task: ThumbnailTask): () => void {
    // Check if already in cache
    const cached = thumbnailCache.get(task.id);
    if (cached) {
      task.onSuccess(cached);
      return () => {};
    }

    // Add to queue
    this.queue.push(task);
    this.processNext();

    // Return cancel function
    return () => {
      this.queue = this.queue.filter(t => t.id !== task.id);
    };
  }

  private processNext() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    // Double check cache
    const cached = thumbnailCache.get(task.id);
    if (cached) {
      task.onSuccess(cached);
      this.processNext();
      return;
    }

    this.activeCount++;
    this.runTask(task);
  }

  private async runTask(task: ThumbnailTask) {
    // 1. Check server-side persistent thumbnail cache first (.mininas_cache/thumbs)
    if (task.storageId && task.relPath) {
      const serverThumbUrl = api.getPhotoThumbUrl(task.relPath, task.storageId);
      try {
        const res = await fetch(serverThumbUrl, { method: 'GET' });
        if (res.ok) {
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          thumbnailCache.set(task.id, objectUrl);
          task.onSuccess(objectUrl);
          this.activeCount--;
          this.processNext();
          return;
        }
      } catch {
        // Proceed to client-side frame capture on error
      }
    }

    let isDone = false;
    const cleanup = () => {
      if (isDone) return;
      isDone = true;
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      clearTimeout(timeoutId);
      video.src = '';
      video.load();
      video.remove();
      this.activeCount--;
      this.processNext();
    };

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';
    video.playsInline = true;

    // Failsafe timeout: 6 seconds max per video
    const timeoutId = setTimeout(() => {
      task.onError();
      cleanup();
    }, 6000);

    const handleLoadedMetadata = () => {
      try {
        const seekTime = Math.min(2.5, Math.max(0.8, (video.duration || 10) * 0.05));
        video.currentTime = seekTime;
      } catch {
        task.onError();
        cleanup();
      }
    };

    const handleSeeked = () => {
      try {
        const vw = video.videoWidth || 320;
        const vh = video.videoHeight || 240;
        const canvas = document.createElement('canvas');

        const maxDimension = 320;
        if (vw >= vh) {
          canvas.width = maxDimension;
          canvas.height = Math.max(1, Math.round(maxDimension * (vh / vw)));
        } else {
          canvas.height = maxDimension;
          canvas.width = Math.max(1, Math.round(maxDimension * (vw / vh)));
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          thumbnailCache.set(task.id, dataUrl);
          task.onSuccess(dataUrl);
          if (task.storageId && task.relPath) {
            api.saveVideoThumb(task.storageId, task.relPath, dataUrl);
          }
        } else {
          task.onError();
        }
      } catch {
        task.onError();
      } finally {
        cleanup();
      }
    };

    const handleError = () => {
      task.onError();
      cleanup();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    try {
      video.src = task.url;
    } catch {
      task.onError();
      cleanup();
    }
  }
}

export const thumbnailQueue = new ThumbnailQueue();
