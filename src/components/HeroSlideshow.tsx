import { useState, useEffect, useMemo } from 'react';
import { GalleryPhoto } from '../types';
import { hexToDataUrl } from '../utils/imageHex';

interface HeroSlideshowProps {
  photos: GalleryPhoto[];
}

export default function HeroSlideshow({ photos }: HeroSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Pre-compute data URLs so hex decode only happens once per photo
  const dataUrls = useMemo(
    () => photos.map((p) => hexToDataUrl(p.imageHex, p.mimeType)),
    [photos],
  );

  useEffect(() => {
    if (photos.length <= 1) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      // Let the CSS transition play, then swap index
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % photos.length);
        setIsTransitioning(false);
      }, 1200); // matches CSS transition duration
    }, 6000); // 6 s visible + 1.2 s fade

    return () => clearInterval(interval);
  }, [photos.length]);

  if (photos.length === 0) return null;

  const prevIndex = (currentIndex - 1 + photos.length) % photos.length;

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden">
      {photos.map((photo, index) => {
        const isActive = index === currentIndex;
        const isPrev = index === prevIndex;

        // Only render the active and previous slides to keep DOM light
        if (!isActive && !isPrev) return null;

        return (
          <div
            key={photo.id}
            className="absolute inset-0 w-full h-full"
            style={{
              zIndex: isActive ? 2 : 1,
              opacity: isActive ? (isTransitioning ? 0 : 1) : 1,
              transition: 'opacity 1.2s ease-in-out',
            }}
          >
            <img
              src={dataUrls[index]}
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

      {/* Ken Burns keyframes */}
      <style>{`
        @keyframes heroKenBurns {
          0%   { transform: scale(1)    translate(0, 0); }
          100% { transform: scale(1.08) translate(-1%, -1%); }
        }
      `}</style>
    </div>
  );
}
