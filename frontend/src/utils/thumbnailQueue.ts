/**
 * Concurrent Video Thumbnail Processing Queue
 * Limits concurrent video decoding on mobile/desktop browsers to prevent main-thread freezing and memory spikes.
 */

type ThumbnailTask = {
  id: string;
  url: string;
  ext: string;
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
      // Seek slightly into the video
      try {
        const seekTime = Math.min(2.5, Math.max(0.8, (video.duration || 10) * 0.05));
        video.currentTime = seekTime;
      } catch (e) {
        task.onError();
        cleanup();
      }
    };

    const handleSeeked = () => {
      try {
        const vw = video.videoWidth || 320;
        const vh = video.videoHeight || 240;
        const canvas = document.createElement('canvas');

        // Optimal dimension for mobile grid/list thumbnails (320px max)
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
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          thumbnailCache.set(task.id, dataUrl);
          task.onSuccess(dataUrl);
        } else {
          task.onError();
        }
      } catch (e) {
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
    } catch (e) {
      task.onError();
      cleanup();
    }
  }
}

export const thumbnailQueue = new ThumbnailQueue();
