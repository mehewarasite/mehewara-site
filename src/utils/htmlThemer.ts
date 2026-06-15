/**
 * htmlThemer.ts
 *
 * Parses an uploaded HTML file, strips all color / background / font-family
 * inline styles and <style> blocks, then injects a theme stylesheet that maps
 * everything to the site's CSS variables so it renders correctly in both
 * dark and light mode.
 */

const THEME_STYLE = `
<style id="mehewara-theme">
  /* ── Reset injected by Mehewara theme engine ── */
  .mehewara-content * {
    font-family: var(--mhw-font, "Noto Sans Sinhala", "Space Grotesk", system-ui, sans-serif) !important;
    color: var(--color-text-primary) !important;
    background-color: transparent !important;
    border-color: var(--color-border) !important;
  }

  .mehewara-content {
    color: var(--color-text-primary);
    line-height: 1.8;
    font-size: 0.9rem;
  }

  /* Headings */
  .mehewara-content h1,
  .mehewara-content h2,
  .mehewara-content h3,
  .mehewara-content h4,
  .mehewara-content h5,
  .mehewara-content h6 {
    color: var(--color-text-primary) !important;
    font-weight: 700;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    line-height: 1.3;
  }

  .mehewara-content h1 { font-size: 1.5rem; }
  .mehewara-content h2 { font-size: 1.25rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.35em; }
  .mehewara-content h3 { font-size: 1.1rem; }

  /* Paragraphs / text */
  .mehewara-content p {
    margin-bottom: 0.9em;
    color: var(--color-text-primary) !important;
  }

  /* Links */
  .mehewara-content a {
    color: #38bdf8 !important;
    text-decoration: underline;
  }

  /* Tables */
  .mehewara-content table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1.2em;
    font-size: 0.85rem;
  }
  .mehewara-content th {
    background-color: var(--color-surface) !important;
    color: var(--color-text-primary) !important;
    font-weight: 600;
    padding: 0.5em 0.75em;
    border: 1px solid var(--color-border) !important;
    text-align: left;
  }
  .mehewara-content td {
    padding: 0.45em 0.75em;
    border: 1px solid var(--color-border) !important;
    color: var(--color-text-primary) !important;
    background-color: transparent !important;
  }
  .mehewara-content tr:nth-child(even) td {
    background-color: var(--color-surface) !important;
  }

  /* Lists */
  .mehewara-content ul,
  .mehewara-content ol {
    padding-left: 1.5em;
    margin-bottom: 0.9em;
  }
  .mehewara-content li {
    margin-bottom: 0.3em;
    color: var(--color-text-primary) !important;
  }

  /* Code / pre */
  .mehewara-content code,
  .mehewara-content pre {
    font-family: "JetBrains Mono", monospace !important;
    font-size: 0.82em;
    background-color: var(--color-surface) !important;
    color: #38bdf8 !important;
    border-radius: 6px;
    padding: 0.15em 0.4em;
  }
  .mehewara-content pre {
    padding: 0.9em 1em;
    overflow-x: auto;
    border: 1px solid var(--color-border);
  }
  .mehewara-content pre code { padding: 0; background: none !important; }

  /* Blockquote */
  .mehewara-content blockquote {
    border-left: 3px solid #38bdf8;
    margin-left: 0;
    padding-left: 1em;
    color: var(--color-text-secondary) !important;
    font-style: italic;
  }

  /* Images */
  .mehewara-content img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 0.5em 0;
  }

  /* Highlight / mark */
  .mehewara-content mark {
    background-color: rgba(56, 189, 248, 0.2) !important;
    color: var(--color-text-primary) !important;
    padding: 0 0.2em;
    border-radius: 3px;
  }

  /* Horizontal rule */
  .mehewara-content hr {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 1.5em 0;
  }
</style>
`;

/**
 * Strips colour / background / font-family properties from an inline style string.
 */
function stripColorStyles(styleAttr: string): string {
  return styleAttr
    .split(';')
    .filter(decl => {
      const prop = decl.split(':')[0]?.trim().toLowerCase();
      if (!prop) return false;
      return !(
        prop === 'color' ||
        prop === 'background' ||
        prop === 'background-color' ||
        prop === 'font-family' ||
        prop === 'font-size' ||       // let the theme control sizing
        prop.startsWith('border-color')
      );
    })
    .join(';');
}

/**
 * Main entry point.
 * Accepts raw HTML file content, returns a sanitised + themed HTML string
 * ready to inject via dangerouslySetInnerHTML inside a .mehewara-content wrapper.
 */
function themeHtml(raw: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'text/html');

  // 1. Remove all <style> and <link rel="stylesheet"> tags
  doc.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => el.remove());

  // 2. Remove all <script> tags (security + irrelevant)
  doc.querySelectorAll('script').forEach(el => el.remove());

  // 3. Strip colour/font inline styles from every element
  doc.querySelectorAll('[style]').forEach(el => {
    const cleaned = stripColorStyles(el.getAttribute('style') || '');
    if (cleaned.trim()) {
      el.setAttribute('style', cleaned);
    } else {
      el.removeAttribute('style');
    }
  });

  // 4. Remove bgcolor / color / face / size HTML attributes (legacy)
  const legacyAttrs = ['bgcolor', 'color', 'face', 'size', 'text', 'link', 'vlink', 'alink'];
  doc.querySelectorAll('*').forEach(el => {
    legacyAttrs.forEach(attr => el.removeAttribute(attr));
    // 4b. Strip inline event handlers (onclick, onerror, onload, etc.) — XSS prevention
    const attrsToRemove: string[] = [];
    for (let i = 0; i < el.attributes.length; i++) {
      if (el.attributes[i].name.toLowerCase().startsWith('on')) {
        attrsToRemove.push(el.attributes[i].name);
      }
    }
    attrsToRemove.forEach(attr => el.removeAttribute(attr));
  });

  // 5. Get the body content (or full doc if no body)
  const body = doc.body || doc.documentElement;
  const innerHtml = body.innerHTML;

  // 6. Return the theme <style> + cleaned content
  return THEME_STYLE + innerHtml;
  
}
export default themeHtml;