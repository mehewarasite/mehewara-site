import { useState, useEffect } from 'react';
import { GalleryPhoto } from '../types';
import { hexToDataUrl } from '../utils/imageHex';

interface HeroSlideshowProps {
  photos: GalleryPhoto[];
}

// Stable cache — hex→base64 decode is expensive, cache by photo ID
const dataUrlCache = new Map<string, string>();
function getCachedDataUrl(photo: GalleryPhoto): string {
  if (!photo?.imageHex) return '';
  if (photo.imageHex.startsWith('http://') || photo.imageHex.startsWith('https://') || photo.imageHex.startsWith('data:')) {
    return photo.imageHex;
  }
  if (!dataUrlCache.has(photo.id)) {
    try {
      dataUrlCache.set(photo.id, hexToDataUrl(photo.imageHex, photo.mimeType));
    } catch {
      return photo.imageHex;
    }
  }
  return dataUrlCache.get(photo.id) || '';
}

export default function HeroSlideshow({ photos }: HeroSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (photos.length <= 1) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      // Let the CSS transition play, then swap index
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % photos.length);
        setIsTransitioning(false);
      }, 1200); // matches CSS transition duration
    }, 4000); // 4 s visible + 1.2 s fade

    return () => clearInterval(interval);
  }, [photos.length]);

  if (photos.length === 0) return null;

  const nextIndex = (currentIndex + 1) % photos.length;

  return (
    <div 
      className="absolute inset-0 w-full h-full overflow-hidden bg-black"
      style={{ animation: 'heroFadeIn 1.5s ease-in-out forwards' }}
    >
      {photos.map((photo, index) => {
        const isActive = index === currentIndex;
        const isNext = index === nextIndex;

        // Only render the active and next slides to keep DOM light
        if (!isActive && !isNext) return null;

        return (
          <div
            key={photo.id}
            className="absolute inset-0 w-full h-full"
            style={{
              zIndex: isActive ? 2 : 1,
              opacity: isActive ? (isTransitioning ? 0 : 1) : 1,
              transition: isActive ? 'opacity 1.2s ease-in-out' : 'none',
            }}
          >
            <img
              src={getCachedDataUrl(photo)}
              alt={photo.title || ''}
              draggable={false}
              className="w-full h-full object-cover"
              style={{
                // Subtle Ken Burns zoom while the slide is visible
                animation: isActive ? 'heroKenBurns 8s ease-in-out forwards' : 'none',
              }}
            />
          </div>
        );
      })}

      {/* Ken Burns and Fade In keyframes */}
      <style>{`
        @keyframes heroKenBurns {
          0%   { transform: scale(1)    translate(0, 0); }
          100% { transform: scale(1.08) translate(-1%, -1%); }
        }
        @keyframes heroFadeIn {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
