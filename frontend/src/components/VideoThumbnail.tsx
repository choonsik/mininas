import React, { useState, useEffect, useRef } from 'react';
import { Film, Play } from 'lucide-react';
import { api } from '../api';
import { thumbnailQueue } from '../utils/thumbnailQueue';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    return thumbnailQueue.getCached(`${storageId}:${relPath}`) || null;
  });
  const [isVisible, setIsVisible] = useState(false);

  // Lazy loading observer
  useEffect(() => {
    if (thumbUrl) return; // Already cached
    const el = containerRef.current;
    if (!el) return;

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [thumbUrl]);

  // Request thumbnail once visible
  useEffect(() => {
    if (!isVisible || thumbUrl) return;

    const lowerExt = ext.toLowerCase();
    if (lowerExt !== '.mp4' && lowerExt !== '.webm' && lowerExt !== '.mov') {
      return;
    }

    const taskId = `${storageId}:${relPath}`;
    const cancel = thumbnailQueue.enqueue({
      id: taskId,
      url: api.getStreamUrl(relPath, storageId),
      ext: lowerExt,
      onSuccess: (url) => setThumbUrl(url),
      onError: () => {},
    });

    return () => cancel();
  }, [isVisible, relPath, storageId, ext, thumbUrl]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-[#0c0c12] overflow-hidden"
    >
      {thumbUrl ? (
        <>
          <img src={thumbUrl} alt={alt} className={className} loading="lazy" />
          {showPlayBadge && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-amber-300 text-[9px] font-bold flex items-center gap-1 shadow pointer-events-none z-10">
              <Play className="w-2.5 h-2.5 fill-current" />
              <span>영상</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center text-content-muted gap-1 select-none pointer-events-none">
          <Film className="w-6 h-6 sm:w-8 sm:h-8 opacity-40 text-indigo-400" />
          <span className="text-[9px] font-mono text-content-muted uppercase">
            {ext.replace('.', '')}
          </span>
        </div>
      )}
    </div>
  );
};
