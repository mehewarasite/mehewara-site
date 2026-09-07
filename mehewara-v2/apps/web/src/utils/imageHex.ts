/**
 * imageHex.ts
 * Utilities for encoding/decoding images as hex byte strings.
 *
 * Why hex?  Hex is a simple, human-readable binary representation.
 * We also apply client-side compression/resizing first so the stored
 * strings stay manageable (a 1200-px JPEG ≈ 80–200 KB → hex ≈ 160–400 KB).
 *
 * Supported input formats: JPEG, PNG, WebP, GIF, BMP, SVG, ICO,
 *   HEIC/HEIF (Apple), TIFF, AVIF, and any format the browser's <img> can decode.
 */

// heic2any is loaded lazily (dynamic import) to avoid bundling ~1.3 MB when not needed

// ── Compression settings ─────────────────────────────────────────────────────

const MAX_DIMENSION = 1200;   // Max width or height in pixels
const JPEG_QUALITY  = 0.82;   // JPEG quality 0–1

// ── Supported format list (for UI accept strings) ────────────────────────────

/** All image MIME types / extensions the gallery accepts */
export const GALLERY_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/svg+xml,' +
  'image/tiff,image/heic,image/heif,image/avif,image/x-icon,' +
  '.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.tiff,.tif,.heic,.heif,.avif,.ico';

// ── Format normalisation ─────────────────────────────────────────────────────

/** MIME types that need special conversion before the browser can render them */
const HEIC_TYPES = new Set(['image/heic', 'image/heif']);
const TIFF_TYPES = new Set(['image/tiff']);

/**
 * Detect HEIC/HEIF by magic bytes (some platforms report wrong MIME).
 * HEIC files start with an ftyp box; bytes 4–7 are "ftyp" and the brand
 * at 8–11 is "heic", "heix", "mif1", etc.
 */
async function looksLikeHeic(file: File): Promise<boolean> {
  if (file.size < 12) return false;
  const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ftyp = String.fromCharCode(buf[4], buf[5], buf[6], buf[7]);
  if (ftyp !== 'ftyp') return false;
  const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
  return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
}

/**
 * Normalise any image File into a browser-friendly Blob (JPEG/PNG/WebP).
 * - HEIC/HEIF → converted via heic2any to JPEG
 * - TIFF / other exotic → loaded into a canvas then re-exported as JPEG
 * - Already-supported formats → returned as-is
 */
export async function normalizeImageFile(file: File): Promise<File> {
  const mime = file.type.toLowerCase();

  // ── HEIC/HEIF handling ──
  if (HEIC_TYPES.has(mime) || await looksLikeHeic(file)) {
    const { default: heic2any } = await import('heic2any');
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(result) ? result[0] : result;
    const name = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], name, { type: 'image/jpeg' });
  }

  // ── TIFF handling (most browsers can't decode TIFF in <img>) ──
  if (TIFF_TYPES.has(mime) || /\.tiff?$/i.test(file.name)) {
    const converted = await convertViaCanvas(file);
    const name = file.name.replace(/\.tiff?$/i, '.jpg');
    return new File([converted], name, { type: 'image/jpeg' });
  }

  // ── Try to load in an Image element; if it fails, attempt canvas rescue ──
  const canLoad = await testImageLoad(file);
  if (!canLoad) {
    try {
      const converted = await convertViaCanvas(file);
      return new File([converted], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    } catch {
      throw new Error(
        `Unsupported image format "${file.name.split('.').pop()?.toUpperCase()}". ` +
        'Please convert to JPEG, PNG, or WebP and try again.'
      );
    }
  }

  return file;
}

/** Quick check: can the browser's Image element decode this file? */
function testImageLoad(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(true); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

/** Load a file into a canvas and re-export as JPEG blob */
function convertViaCanvas(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image decode failed')); };
    img.src = url;
  });
}

/**
 * Create a preview-safe object URL from any image file.
 * Normalises HEIC/TIFF first so the browser can display them.
 */
export async function createPreviewUrl(file: File): Promise<{ url: string; normalizedFile: File }> {
  const normalizedFile = await normalizeImageFile(file);
  const url = URL.createObjectURL(normalizedFile);
  return { url, normalizedFile };
}

// ── Compression pipeline ─────────────────────────────────────────────────────

/**
 * Resize + compress an image File/Blob to a canvas JPEG, then return the
 * compressed bytes as a Uint8Array.
 * Expects a browser-decodable file (run through normalizeImageFile first).
 */
async function compressImage(file: File): Promise<{ bytes: Uint8Array; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Downscale if either dimension exceeds MAX_DIMENSION
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round((height / width) * MAX_DIMENSION);
          width  = MAX_DIMENSION;
        } else {
          width  = Math.round((width / height) * MAX_DIMENSION);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D context unavailable')); return; }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
          blob.arrayBuffer().then((ab) => {
            resolve({ bytes: new Uint8Array(ab), mimeType: 'image/jpeg' });
          }).catch(reject);
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

// ── Hex encoding helpers ──────────────────────────────────────────────────────

/**
 * Convert a Uint8Array to a lowercase hex string.
 * e.g. [0xFF, 0xD8] → "ffd8"
 */
export function bytesToHex(bytes: Uint8Array): string {
  // Use a lookup table for speed
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return hex.join('');
}

/**
 * Convert a hex string back to a Uint8Array.
 * e.g. "ffd8" → [0xFF, 0xD8]
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read an image File, normalise its format, compress it, and encode as hex.
 * Returns `{ hex, mimeType, fileSizeKB }`.
 *
 * Supports: JPEG, PNG, WebP, GIF, BMP, HEIC, HEIF, TIFF, AVIF, SVG, ICO.
 *
 * @param file  The image File chosen by the user
 * @param onProgress  Optional callback with 0–100 progress value
 */
export async function imageFileToHex(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ hex: string; mimeType: string; fileSizeKB: number }> {
  onProgress?.(5);
  // Normalise exotic formats (HEIC, TIFF, etc.) to browser-friendly ones
  const normalizedFile = await normalizeImageFile(file);
  onProgress?.(30);
  const { bytes, mimeType } = await compressImage(normalizedFile);
  onProgress?.(80);
  const hex = bytesToHex(bytes);
  onProgress?.(100);
  return { hex, mimeType, fileSizeKB: Math.round(bytes.length / 1024) };
}

/**
 * Convert a stored hex string back to a `data:` URL usable as an <img src>.
 * Uses base64 (not binary) because browsers understand data URLs in base64.
 */
export function hexToDataUrl(hex: string, mimeType: string): string {
  // Convert hex → binary string → base64
  const bytes  = hexToBytes(hex);
  let binary   = '';
  const CHUNK  = 8192; // Process in chunks to avoid call stack limits
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.slice(i, i + CHUNK));
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}
