import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Images, ZoomIn } from 'lucide-react';
import { GalleryPhoto } from '../types';
import { hexToDataUrl } from '../utils/imageHex';
import { useTheme } from '../ThemeContext';

interface GalleryPageProps {
  photos: GalleryPhoto[];
  isLoading?: boolean;
}

// ── Cached data URL memo (hex decode is expensive, only do it once per photo) ─
const dataUrlCache = new Map<string, string>();

function getDataUrl(photo: GalleryPhoto): string {
  if (!dataUrlCache.has(photo.id)) {
    dataUrlCache.set(photo.id, hexToDataUrl(photo.imageHex, photo.mimeType));
  }
  return dataUrlCache.get(photo.id)!;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard({ isDark }: { isDark: boolean }) {
  return (
    <div className={`rounded-2xl overflow-hidden animate-pulse ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
      <div className={`w-full aspect-[4/3] ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
      <div className="p-4 space-y-2">
        <div className={`h-4 w-3/4 rounded ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
        <div className={`h-3 w-full rounded ${isDark ? 'bg-slate-800/60' : 'bg-slate-200/60'}`} />
        <div className={`h-3 w-2/3 rounded ${isDark ? 'bg-slate-800/40' : 'bg-slate-200/40'}`} />
      </div>
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
interface LightboxProps {
  photos: GalleryPhoto[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

function Lightbox({ photos, index, onClose, onPrev, onNext }: LightboxProps) {
  const photo = photos[index];
  const dataUrl = getDataUrl(photo);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-white/60 font-mono bg-black/40 px-3 py-1.5 rounded-full">
        {index + 1} / {photos.length}
      </div>

      {/* Prev */}
      {photos.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-3 sm:left-6 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
          aria-label="Previous"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Image + caption */}
      <div
        className="max-w-5xl w-full mx-16 sm:mx-24 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={dataUrl}
          alt={photo.title}
          className="max-h-[70vh] max-w-full object-contain rounded-2xl shadow-2xl shadow-black/60 select-none"
          draggable={false}
        />
        <div className="text-center space-y-1 max-w-xl px-4">
          <h3 className="text-white font-bold text-lg leading-snug">{photo.title}</h3>
          {photo.description && (
            <p className="text-white/60 text-sm leading-relaxed">{photo.description}</p>
          )}
        </div>
      </div>

      {/* Next */}
      {photos.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-3 sm:right-6 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
          aria-label="Next"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

// ── Photo card ────────────────────────────────────────────────────────────────
interface PhotoCardProps {
  photo: GalleryPhoto;
  onClick: () => void;
  isDark: boolean;
}

function PhotoCard({ photo, onClick, isDark }: PhotoCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    // Lazy-decode: only convert hex → data URL when card mounts
    setSrc(getDataUrl(photo));
  }, [photo]);

  return (
    <div
      className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${
        isDark
          ? 'bg-slate-900 border border-slate-800/80 hover:border-sky-500/30 hover:shadow-[0_0_24px_rgba(14,165,233,0.12)]'
          : 'bg-white border border-slate-200 hover:border-sky-400/40 hover:shadow-xl shadow-sm'
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={`View photo: ${photo.title}`}
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-[4/3] overflow-hidden">
        {!loaded && (
          <div className={`absolute inset-0 animate-pulse ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`} />
        )}
        {src && (
          <img
            src={src}
            alt={photo.title}
            className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)}
            draggable={false}
          />
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <ZoomIn className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="p-4">
        <h3 className={`font-bold text-sm leading-snug mb-1 ${isDark ? 'text-white' : 'text-slate-900'} group-hover:text-sky-400 transition-colors line-clamp-1`}>
          {photo.title}
        </h3>
        {photo.description && (
          <p className={`text-xs leading-relaxed line-clamp-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {photo.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main gallery page component ───────────────────────────────────────────────
export default function GalleryPage({ photos, isLoading = false }: GalleryPageProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevPhoto = useCallback(() => {
    setLightboxIndex((i) => (i !== null ? (i - 1 + photos.length) % photos.length : null));
  }, [photos.length]);
  const nextPhoto = useCallback(() => {
    setLightboxIndex((i) => (i !== null ? (i + 1) % photos.length : null));
  }, [photos.length]);

  // Touch swipe support for lightbox
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) dx < 0 ? nextPhoto() : prevPhoto();
    touchStartX.current = null;
  };

  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted   = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="w-full">
      {/* Section Header */}
      <div className="mb-6 sm:mb-8 space-y-1">
        <span className="text-[10px] tracking-widest text-sky-400 font-mono font-bold uppercase">
          Media
        </span>
        <h2 className={`text-2xl sm:text-3xl font-extrabold ${textPrimary} leading-snug flex items-center gap-3`}>
          <span className="w-9 h-9 bg-sky-500/10 border border-sky-500/30 rounded-2xl flex items-center justify-center text-sky-400 shrink-0">
            <Images className="w-5 h-5" />
          </span>
          Photo Gallery
        </h2>
        <p className={`text-xs ${textMuted} leading-relaxed`}>
          A collection of moments from Mehewara's journey.
        </p>
      </div>

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} isDark={isDark} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && photos.length === 0 && (
        <div className={`flex flex-col items-center justify-center py-20 text-center rounded-3xl border border-dashed ${isDark ? 'border-slate-800 bg-slate-950/30' : 'border-slate-200 bg-slate-50'}`}>
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mb-4 ${isDark ? 'bg-slate-900 text-slate-600' : 'bg-slate-100 text-slate-300'}`}>
            <Images className="w-8 h-8" />
          </div>
          <p className={`text-sm font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No photos yet</p>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>Photos added from the Admin Panel will appear here.</p>
        </div>
      )}

      {/* Photo Grid */}
      {!isLoading && photos.length > 0 && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {photos.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              isDark={isDark}
              onClick={() => openLightbox(index)}
            />
          ))}
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={prevPhoto}
          onNext={nextPhoto}
        />
      )}
    </div>
  );
}
