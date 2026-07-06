/**
 * imageHex.ts
 * Utilities for encoding/decoding images as hex byte strings.
 *
 * Why hex?  Hex is a simple, human-readable binary representation.
 * We also apply client-side compression/resizing first so the stored
 * strings stay manageable (a 1200-px JPEG ≈ 80–200 KB → hex ≈ 160–400 KB).
 */

// ── Compression settings ─────────────────────────────────────────────────────

const MAX_DIMENSION = 1200;   // Max width or height in pixels
const JPEG_QUALITY  = 0.82;   // JPEG quality 0–1

/**
 * Resize + compress an image File/Blob to a canvas JPEG, then return the
 * compressed bytes as a Uint8Array.
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
 * Read an image File, compress it, and encode as a hex string.
 * Returns `{ hex, mimeType, fileSizeKB }`.
 *
 * @param file  The image File chosen by the user
 * @param onProgress  Optional callback with 0–100 progress value
 */
export async function imageFileToHex(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ hex: string; mimeType: string; fileSizeKB: number }> {
  onProgress?.(5);
  const { bytes, mimeType } = await compressImage(file);
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
