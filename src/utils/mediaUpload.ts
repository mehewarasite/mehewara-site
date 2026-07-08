// Compress image using Canvas API
export async function compressImage(file: File, maxWidth = 1024, quality = 0.75): Promise<string> {
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

        // Calculate new dimensions while maintaining aspect ratio
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

        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to WebP (or JPEG if WebP isn't supported)
        const compressedDataUrl = canvas.toDataURL('image/webp', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
}

// Compress image and return a Blob (useful for uploading to Supabase Storage)
export async function compressImageToBlob(file: File, maxWidth = 1024, quality = 0.75): Promise<Blob> {
  const dataUrl = await compressImage(file, maxWidth, quality);
  const res = await fetch(dataUrl);
  return await res.blob();
}

export async function fileToImgHtml(file: File, className = 'mhw-q-img'): Promise<string> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|bmp|svg|tiff?|heic|heif|avif|ico)$/i.test(file.name)) {
    throw new Error('Please upload an image file (PNG, JPG, WEBP, HEIC, TIFF, etc.).');
  }
  
  // Normalise exotic formats (HEIC, TIFF, etc.) before compressing
  const { normalizeImageFile } = await import('./imageHex');
  const normalizedFile = await normalizeImageFile(file);
  
  // Compress the image (max width 1024px, 75% quality webp)
  const dataUrl = await compressImage(normalizedFile, 1024, 0.75);
  
  const alt = file.name.replace(/"/g, '&quot;');
  return `<img src="${dataUrl}" alt="${alt}" class="${className}" />`;
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