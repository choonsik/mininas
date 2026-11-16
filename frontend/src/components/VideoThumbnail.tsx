import React, { useState, useEffect } from 'react';
import { Film, Play } from 'lucide-react';
import { api } from '../api';

interface VideoThumbnailProps {
  relPath: string;
  storageId: string;
  ext: string;
  alt?: string;
  className?: string;
  showPlayBadge?: boolean;
}

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({
  relPath,
  storageId,
  ext,
  alt = 'Video thumbnail',
  className = 'w-full h-full object-contain transition-transform duration-300 group-hover:scale-105',
  showPlayBadge = true,
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    const lowerExt = ext.toLowerCase();
    // Only capture HTML5 video formats
    if (lowerExt !== '.mp4' && lowerExt !== '.webm' && lowerExt !== '.mov') {
      return;
    }

    let isMounted = true;
    const video = document.createElement('video');
    video.src = api.getStreamUrl(relPath, storageId);
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    const handleLoadedMetadata = () => {
      // Seek slightly into the video (0.8s to 2.5s) to avoid black initial frame
      video.currentTime = Math.min(2.5, Math.max(0.8, (video.duration || 10) * 0.05));
    };

    const handleSeeked = () => {
      if (!isMounted) return;
      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const canvas = document.createElement('canvas');

        // Preserve 100% accurate original aspect ratio (width-based or height-based)
        const maxDimension = 480;
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
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setThumbUrl(dataUrl);
        }
      } catch (e) {
        // Fallback silently
      } finally {
        video.src = '';
        video.remove();
      }
    };

    const handleError = () => {
      video.src = '';
      video.remove();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    return () => {
      isMounted = false;
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      video.src = '';
      video.remove();
    };
  }, [relPath, storageId, ext]);

  if (thumbUrl) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-[#0c0c12] overflow-hidden">
        <img src={thumbUrl} alt={alt} className={className} loading="lazy" />
        {showPlayBadge && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-amber-300 text-[9px] font-bold flex items-center gap-1 shadow pointer-events-none z-10">
            <Play className="w-2.5 h-2.5 fill-current" />
            <span>영상</span>
          </div>
        )}
      </div>
    );
  }

  // Fallback placeholder while loading or for non-HTML5 formats (MKV, AVI)
  return (
    <div className="w-full h-full bg-[#12121c] flex flex-col items-center justify-center relative">
      <Film className="w-8 h-8 text-amber-400/60" />
      <span className="text-[10px] font-mono text-gray-500 mt-1 uppercase">{ext.replace('.', '')}</span>
      {showPlayBadge && (
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-amber-300 text-[9px] font-bold flex items-center gap-1 shadow pointer-events-none z-10">
          <Play className="w-2.5 h-2.5 fill-current" />
          <span>영상</span>
        </div>
      )}
    </div>
  );
};
