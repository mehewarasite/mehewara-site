import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Images, ZoomIn, ShieldCheck, Shuffle, Pin } from 'lucide-react';
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

// ── DRM / Protection utilities ────────────────────────────────────────────────

/**
 * Global DRM protection hook.
 * Blocks context menu, keyboard shortcuts (PrintScreen, Ctrl+S, Ctrl+U, Ctrl+Shift+I/J/C, F12),
 * drag events, and detects visibility changes to blur content.
 */
function useImageProtection(active: boolean) {
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  useEffect(() => {
    if (!active) return;

    // ── Block context menu globally within gallery ──
    const blockContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-gallery-protected]')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // ── Block dangerous keyboard shortcuts ──
    const blockKeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-gallery-protected]') && !document.querySelector('[data-lightbox-active]')) return;

      // PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        return;
      }

      // Ctrl/Cmd combinations
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+S (save), Ctrl+U (source), Ctrl+P (print)
        if (['s', 'u', 'p'].includes(e.key.toLowerCase())) {
          e.preventDefault();
          return;
        }
        // Ctrl+Shift+I/J/C (devtools)
        if (e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) {
          e.preventDefault();
          return;
        }
      }

      // F12 (devtools)
      if (e.key === 'F12') {
        e.preventDefault();
        return;
      }
    };

    // ── Block all drag events ──
    const blockDrag = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-gallery-protected]')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // ── Visibility change detection (blur on tab switch / screenshot) ──
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    const handleWindowBlur = () => setIsPageVisible(false);
    const handleWindowFocus = () => setIsPageVisible(true);

    // ── DevTools detection (resize-based heuristic) ──
    let devToolsCheckInterval: ReturnType<typeof setInterval>;
    const checkDevTools = () => {
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      setDevToolsOpen(widthThreshold || heightThreshold);
    };
    devToolsCheckInterval = setInterval(checkDevTools, 1000);

    // Attach listeners
    document.addEventListener('contextmenu', blockContextMenu, true);
    document.addEventListener('keydown', blockKeys, true);
    document.addEventListener('dragstart', blockDrag, true);
    document.addEventListener('drop', blockDrag, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu, true);
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('dragstart', blockDrag, true);
      document.removeEventListener('drop', blockDrag, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      clearInterval(devToolsCheckInterval);
    };
  }, [active]);

  return { isPageVisible, devToolsOpen };
}

// ── Protected Canvas Image ────────────────────────────────────────────────────

/**
 * Renders an image onto a <canvas> element instead of <img>.
 * Canvas content cannot be right-clicked and saved, and is harder to extract.
 * Also applies a subtle watermark pattern directly onto the canvas pixels.
 */
interface ProtectedCanvasProps {
  src: string;
  alt: string;
  className?: string;
  watermarkText?: string;
  onReady?: () => void;
  style?: React.CSSProperties;
}

function ProtectedCanvas({ src, alt, className = '', watermarkText = 'MEHEWARA', onReady, style }: ProtectedCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas dimensions to match container
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerW = containerRect.width;
      const containerH = containerRect.height;

      // Calculate object-cover dimensions
      const imgRatio = img.width / img.height;
      const containerRatio = containerW / containerH;

      let drawW: number, drawH: number, offsetX: number, offsetY: number;

      if (imgRatio > containerRatio) {
        // Image is wider — crop sides
        drawH = containerH;
        drawW = containerH * imgRatio;
        offsetX = -(drawW - containerW) / 2;
        offsetY = 0;
      } else {
        // Image is taller — crop top/bottom
        drawW = containerW;
        drawH = containerW / imgRatio;
        offsetX = 0;
        offsetY = -(drawH - containerH) / 2;
      }

      // Use device pixel ratio for sharp rendering
      const dpr = window.devicePixelRatio || 1;
      canvas.width = containerW * dpr;
      canvas.height = containerH * dpr;
      canvas.style.width = `${containerW}px`;
      canvas.style.height = `${containerH}px`;
      ctx.scale(dpr, dpr);

      // Draw the image
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      // Draw subtle watermark pattern
      ctx.save();
      ctx.globalAlpha = 0.035;
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px "Space Grotesk", sans-serif';
      ctx.rotate(-30 * Math.PI / 180);

      const text = watermarkText;
      const spacing = 160;
      for (let y = -containerH; y < containerH * 2; y += spacing) {
        for (let x = -containerW; x < containerW * 2; x += spacing) {
          ctx.fillText(text, x, y);
        }
      }
      ctx.restore();

      onReady?.();
    };
    img.onerror = () => { onReady?.(); };
    img.src = src;
  }, [src, watermarkText, onReady]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={style}
      aria-label={alt}
      role="img"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: 'none',
          WebkitTouchCallout: 'none',
        } as React.CSSProperties}
      />
      {/* Invisible overlay shield — blocks all interaction with the canvas */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        } as React.CSSProperties}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      />
    </div>
  );
}

// ── Protected Lightbox Canvas (object-contain mode) ───────────────────────────

function ProtectedLightboxCanvas({ src, alt, watermarkText = 'MEHEWARA' }: {
  src: string;
  alt: string;
  watermarkText?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !src || !container) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const containerRect = container.getBoundingClientRect();
      const maxW = containerRect.width;
      const maxH = containerRect.height;

      // Calculate object-contain dimensions
      const imgRatio = img.width / img.height;
      const containerRatio = maxW / maxH;

      let drawW: number, drawH: number;
      if (imgRatio > containerRatio) {
        drawW = maxW;
        drawH = maxW / imgRatio;
      } else {
        drawH = maxH;
        drawW = maxH * imgRatio;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(drawW * dpr);
      canvas.height = Math.round(drawH * dpr);
      canvas.style.width = `${Math.round(drawW)}px`;
      canvas.style.height = `${Math.round(drawH)}px`;
      ctx.scale(dpr, dpr);

      // Draw image
      ctx.drawImage(img, 0, 0, drawW, drawH);

      // Watermark
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px "Space Grotesk", sans-serif';
      ctx.rotate(-30 * Math.PI / 180);

      const spacing = 180;
      for (let y = -drawH; y < drawH * 2; y += spacing) {
        for (let x = -drawW; x < drawW * 2; x += spacing) {
          ctx.fillText(watermarkText, x, y);
        }
      }
      ctx.restore();

      setLoaded(true);
    };
    img.src = src;
  }, [src, watermarkText]);

  return (
    <div
      ref={containerRef}
      className="max-h-[70vh] max-w-full flex items-center justify-center"
      style={{ width: '100%', height: '70vh' }}
      aria-label={alt}
      role="img"
    >
      <canvas
        ref={canvasRef}
        className={`rounded-2xl shadow-2xl shadow-black/60 transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: 'none',
          WebkitTouchCallout: 'none',
          maxWidth: '100%',
          maxHeight: '70vh',
          objectFit: 'contain',
        } as React.CSSProperties}
      />
      {/* Invisible shield overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        } as React.CSSProperties}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      />
    </div>
  );
}

// ── Watermark overlay (CSS-based, on top of everything) ───────────────────────

function WatermarkOverlay() {
  return (
    <div
      className="absolute inset-0 z-[2] pointer-events-none overflow-hidden select-none"
      style={{
        background: `repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 120px,
          rgba(255,255,255,0.015) 120px,
          rgba(255,255,255,0.015) 121px
        )`,
      }}
      aria-hidden="true"
    />
  );
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
  isPageVisible: boolean;
}

function Lightbox({ photos, index, onClose, onPrev, onNext, isPageVisible }: LightboxProps) {
  const photo = photos[index];
  const dataUrl = getDataUrl(photo);

  // Keyboard navigation (Arrow keys only — dangerous keys handled by protection hook)
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
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in gallery-protected-zone"
      onClick={onClose}
      data-gallery-protected
      data-lightbox-active
      onContextMenu={(e) => e.preventDefault()}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      } as React.CSSProperties}
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
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-white/60 font-mono bg-black/40 px-3 py-1.5 rounded-full flex items-center gap-2">
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
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
        className={`max-w-5xl w-full mx-16 sm:mx-24 flex flex-col items-center gap-4 relative transition-all duration-500 ${isPageVisible ? '' : 'blur-xl scale-95 opacity-30'
          }`}
        onClick={(e) => e.stopPropagation()}
      >
        <ProtectedLightboxCanvas
          src={dataUrl}
          alt={photo.title || 'Untitled'}
          watermarkText="MEHEWARA"
        />
        <WatermarkOverlay />

        <div className="text-center space-y-1 max-w-xl px-4 z-[3]">
          {photo.title && <h3 className="text-white font-bold text-lg leading-snug">{photo.title}</h3>}
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
  isPageVisible: boolean;
}

function PhotoCard({ photo, onClick, isDark, isPageVisible }: PhotoCardProps) {
  const [loaded, setLoaded] = useState(false);
  const src = useMemo(() => getDataUrl(photo), [photo]);

  return (
    <div
      className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 gallery-protected-zone ${isDark
          ? 'bg-slate-900 border border-slate-800/80 hover:border-sky-500/30 hover:shadow-[0_0_24px_rgba(14,165,233,0.12)]'
          : 'bg-white border border-slate-200 hover:border-sky-400/40 hover:shadow-xl shadow-sm'
        }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      aria-label={`View photo: ${photo.title || 'Untitled'}`}
      data-gallery-protected
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      } as React.CSSProperties}
    >
      {/* Thumbnail — rendered on canvas */}
      <div className={`relative w-full aspect-[4/3] overflow-hidden transition-all duration-500 ${isPageVisible ? '' : 'blur-xl opacity-30'
        }`}>
        {!loaded && (
          <div className={`absolute inset-0 animate-pulse ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`} />
        )}
        <ProtectedCanvas
          src={src}
          alt={photo.title || 'Untitled'}
          className="w-full h-full"
          onReady={() => setLoaded(true)}
        />
        <WatermarkOverlay />

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-[3]">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <ZoomIn className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="p-4 relative">
        {photo.pinned && (
           <div className="absolute top-0 right-4 -mt-3 w-6 h-6 bg-sky-500 rounded-full flex items-center justify-center text-white shadow-lg z-10" title="Pinned">
             <Pin className="w-3 h-3 fill-current" />
           </div>
        )}
        {photo.title && (
          <h3 className={`font-bold text-sm leading-snug mb-1 ${isDark ? 'text-white' : 'text-slate-900'} group-hover:text-sky-400 transition-colors line-clamp-1`}>
            {photo.title}
          </h3>
        )}
        {photo.description && (
          <p className={`text-xs leading-relaxed line-clamp-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {photo.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ── DevTools Warning Overlay ──────────────────────────────────────────────────

function DevToolsWarning({ isDark }: { isDark: boolean }) {
  return (
    <div className={`fixed inset-0 z-[300] flex items-center justify-center backdrop-blur-3xl ${isDark ? 'bg-slate-950/95' : 'bg-white/95'
      }`}>
      <div className="text-center space-y-4 max-w-md px-8">
        <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center ${isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-500'
          }`}>
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Content Protected
        </h2>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Gallery photos are protected by DRM. Please close developer tools to continue viewing.
        </p>
      </div>
    </div>
  );
}

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Main gallery page component ───────────────────────────────────────────────
export default function GalleryPage({ photos, isLoading = false }: GalleryPageProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffledPhotos, setShuffledPhotos] = useState<GalleryPhoto[]>([]);
  const [shuffleKey, setShuffleKey] = useState(0); // triggers re-render animation

  // The display order: pinned first, then unpinned (respecting shuffled order if applicable)
  const displayPhotos = useMemo(() => {
    const base = isShuffled ? shuffledPhotos : photos;
    const pinned = base.filter(p => p.pinned);
    const unpinned = base.filter(p => !p.pinned);
    return [...pinned, ...unpinned];
  }, [isShuffled, shuffledPhotos, photos]);

  // Activate DRM protection when gallery has photos
  const { isPageVisible, devToolsOpen } = useImageProtection(displayPhotos.length > 0 || lightboxIndex !== null);

  // Shuffle handler
  const handleShuffle = useCallback(() => {
    setShuffledPhotos(shuffleArray(photos));
    setIsShuffled(true);
    setShuffleKey((k) => k + 1);
    setLightboxIndex(null); // close lightbox on shuffle
  }, [photos]);

  // Reset to original order
  const handleResetOrder = useCallback(() => {
    setIsShuffled(false);
    setShuffledPhotos([]);
    setShuffleKey((k) => k + 1);
    setLightboxIndex(null);
  }, []);

  // Sync shuffled photos if the source photos change (e.g. new upload)
  useEffect(() => {
    if (isShuffled) {
      // Keep shuffled but add any new photos, remove deleted ones
      const existingIds = new Set(shuffledPhotos.map((p) => p.id));
      const newPhotos = photos.filter((p) => !existingIds.has(p.id));
      const validShuffled = shuffledPhotos.filter((p) => photos.some((pp) => pp.id === p.id));
      if (newPhotos.length > 0 || validShuffled.length !== shuffledPhotos.length) {
        setShuffledPhotos([...validShuffled, ...newPhotos]);
      }
    }
  }, [photos, isShuffled]);

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevPhoto = useCallback(() => {
    setLightboxIndex((i) => (i !== null ? (i - 1 + displayPhotos.length) % displayPhotos.length : null));
  }, [displayPhotos.length]);
  const nextPhoto = useCallback(() => {
    setLightboxIndex((i) => (i !== null ? (i + 1) % displayPhotos.length : null));
  }, [displayPhotos.length]);

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
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div
      className="w-full gallery-protected-zone"
      data-gallery-protected
      onContextMenu={(e) => e.preventDefault()}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      } as React.CSSProperties}
    >
      {/* DevTools warning overlay */}
      {devToolsOpen && photos.length > 0 && <DevToolsWarning isDark={isDark} />}

      {/* Section Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <span className="text-[10px] tracking-widest text-sky-400 font-mono font-bold uppercase">
              Media
            </span>
            <h2 className={`text-2xl sm:text-3xl font-extrabold ${textPrimary} leading-snug flex items-center gap-3`}>
              <span className="w-9 h-9 bg-sky-500/10 border border-sky-500/30 rounded-2xl flex items-center justify-center text-sky-400 shrink-0">
                <Images className="w-5 h-5" />
              </span>
              Photo Gallery
            </h2>
            <p className={`text-xs ${textMuted} leading-relaxed flex items-center gap-1.5`}>
              <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
              A collection of moments from Mehewara's journey.
            </p>
          </div>

          {/* Shuffle / Reset buttons */}
          {photos.length > 1 && (
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={handleShuffle}
                className={`group flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 cursor-pointer ${isDark
                    ? 'bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 hover:border-sky-400/50 hover:shadow-[0_0_16px_rgba(14,165,233,0.15)]'
                    : 'bg-sky-50 border border-sky-200 text-sky-600 hover:bg-sky-100 hover:border-sky-300 hover:shadow-md'
                  }`}
                aria-label="Shuffle photos"
              >
                <Shuffle className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-180" />
                Shuffle
              </button>
              {isShuffled && (
                <button
                  onClick={handleResetOrder}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-300 cursor-pointer ${isDark
                      ? 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                      : 'bg-slate-100 border border-slate-200 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                    }`}
                  aria-label="Reset to original order"
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
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
      {!isLoading && displayPhotos.length > 0 && (
        <div
          key={shuffleKey}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {displayPhotos.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              isDark={isDark}
              isPageVisible={isPageVisible}
              onClick={() => openLightbox(index)}
            />
          ))}
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={displayPhotos}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={prevPhoto}
          onNext={nextPhoto}
          isPageVisible={isPageVisible}
        />
      )}
    </div>
  );
}
