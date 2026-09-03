import { supabase } from '../supabase';

// Compress image using Canvas API
export async function compressImage(file: File, maxWidth = 800, quality = 0.62): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions while maintaining aspect ratio (default max 800px)
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(img.src); // Fallback to original if canvas fails
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to WebP at high compression
        const compressedDataUrl = canvas.toDataURL('image/webp', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
}

// Compress image natively to a WebP Blob (high compression, zero base64 overhead)
export async function compressImageToBlob(file: File, maxWidth = 800, quality = 0.62): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fetch(img.src).then(r => r.blob()).then(resolve).catch(reject);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Native binary WebP blob export
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              // Fallback to JPEG if WebP blob generation fails
              canvas.toBlob(
                (fallbackBlob) => fallbackBlob ? resolve(fallbackBlob) : reject(new Error('Failed to compress image to blob')),
                'image/jpeg',
                quality
              );
            }
          },
          'image/webp',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
}

// Upload image directly to Supabase Storage (question-images bucket)
export async function uploadImageToSupabaseStorage(
  file: File,
  folder = 'diagrams',
  maxWidth = 800,
  quality = 0.62
): Promise<string> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|bmp|svg|tiff?|heic|heif|avif|ico)$/i.test(file.name)) {
    throw new Error('Please upload an image file (PNG, JPG, WEBP, HEIC, TIFF, etc.).');
  }

  // Normalise exotic formats (HEIC, TIFF, etc.) before compressing
  const { normalizeImageFile } = await import('./imageHex');
  const normalizedFile = await normalizeImageFile(file);

  // Compress the image to a WebP blob with higher compression
  const blob = await compressImageToBlob(normalizedFile, maxWidth, quality);

  // Generate a clean, unique file path in Supabase Storage
  const cleanBase = file.name
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 30);
  const fileName = `${folder}/${Date.now()}_${cleanBase || 'img'}_${Math.random().toString(36).substring(7)}.webp`;

  const { error } = await supabase.storage
    .from('question-images')
    .upload(fileName, blob, {
      contentType: 'image/webp',
      upsert: true
    });

  if (error) {
    console.error('Supabase storage upload error:', error);
    throw new Error(`Failed to upload image to Supabase Storage: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('question-images')
    .getPublicUrl(fileName);

  return publicUrl;
}

export async function fileToImgHtml(file: File, className = 'mhw-q-img', folder = 'diagrams'): Promise<string> {
  // Use aggressive compression for small option thumbnails vs main question diagrams
  const isOptionImg = className.includes('mhw-opt-img');
  const maxWidth = isOptionImg ? 480 : 800;
  const quality = isOptionImg ? 0.58 : 0.62;

  const publicUrl = await uploadImageToSupabaseStorage(file, folder, maxWidth, quality);
  const alt = file.name.replace(/"/g, '&quot;');
  return `<img src="${publicUrl}" alt="${alt}" class="${className}" />`;
}

// Replaces <div class="image-placeholder..."> if present, or appends the new image HTML
export function insertOrReplaceImage(currentHtml: string, imgHtml: string): string {
  if (!currentHtml) return imgHtml;
  if (currentHtml.includes('class="image-placeholder')) {
    return currentHtml.replace(
      /<div class="image-placeholder[^>]*>.*?<\/div>/i,
      imgHtml
    );
  }
  return appendHtml(currentHtml, imgHtml);
}

export function appendHtml(current: string, addition: string): string {
  const trimmed = current.trim();
  return trimmed ? `${trimmed}\n${addition}` : addition;
}

export function optionHasContent(value: string): boolean {
  return value.trim().length > 0;
}

// Strip HTML tags and check if there's actual text/image content
export function hasRealContent(html: string): boolean {
  if (!html) return false;
  if (html.includes('<img')) return true;
  if (html.includes('class="mhw-eq"')) return true; // KaTeX equation
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').trim().length > 0;
}