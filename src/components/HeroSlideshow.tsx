import { useState, useEffect, useMemo } from 'react';
import { GalleryPhoto } from '../types';
import { hexToDataUrl } from '../utils/imageHex';
import { normalizeMediaUrl } from '../apiClient';
import {
  inferPhotoDistrict,
  getDistrictInfo,
  DistrictInfo,
} from '../data/districtBackgrounds';
import { MapPin } from 'lucide-react';

interface HeroSlideshowProps {
  photos: GalleryPhoto[];
}

// Stable cache — hex→base64 decode is expensive, cache by photo ID
const dataUrlCache = new Map<string, string>();
function getCachedDataUrl(photo: GalleryPhoto): string {
  if (!photo?.imageHex) return '';
  if (
    photo.imageHex.startsWith('/') ||
    photo.imageHex.startsWith('http://') ||
    photo.imageHex.startsWith('https://') ||
    photo.imageHex.startsWith('/api/')
  ) {
    return normalizeMediaUrl(photo.imageHex);
  }
  if (photo.imageHex.startsWith('data:')) {
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
  const activePhotos = useMemo(() => {
    return photos || [];
  }, [photos]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (activePhotos.length <= 1) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % activePhotos.length);
        setIsTransitioning(false);
      }, 1200); // matches CSS transition duration
    }, 5500); // 5.5 s visible + 1.2 s fade

    return () => clearInterval(interval);
  }, [activePhotos.length]);

  if (activePhotos.length === 0) return null;

  const currentPhoto = activePhotos[currentIndex];
  const nextIndex = (currentIndex + 1) % activePhotos.length;

  const currentDistrictSlug = inferPhotoDistrict(currentPhoto);
  const currentDistrictInfo: DistrictInfo | undefined = getDistrictInfo(currentDistrictSlug);

  return (
    <div 
      className="absolute inset-0 w-full h-full overflow-hidden bg-black"
      style={{ animation: 'heroFadeIn 1.5s ease-in-out forwards' }}
    >
      {activePhotos.map((photo, index) => {
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

      {/* District location tag watermark at bottom-right of hero */}
      {currentDistrictInfo && (
        <div
          className="absolute bottom-6 right-6 z-10 pointer-events-none transition-opacity duration-1000 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/80 shadow-lg text-[11px] font-mono tracking-wide"
          style={{ opacity: isTransitioning ? 0 : 1 }}
        >
          <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>{currentDistrictInfo.name} District</span>
          <span className="text-white/40 font-sans text-[10px]">({currentDistrictInfo.nameSi})</span>
        </div>
      )}

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
