const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function fileToImgHtml(file: File, className = 'mhw-q-img'): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file (PNG, JPG, WEBP, etc.).');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image must be under 2 MB.');
  }
  const dataUrl = await readFileAsDataUrl(file);
  const alt = file.name.replace(/"/g, '&quot;');
  return `<img src="${dataUrl}" alt="${alt}" class="${className}" />`;
}

export function dataUrlToImgHtml(dataUrl: string, alt: string, className = 'mhw-q-img'): string {
  const safeAlt = alt.replace(/"/g, '&quot;');
  return `<img src="${dataUrl}" alt="${safeAlt}" class="${className}" />`;
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