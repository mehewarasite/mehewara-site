// ── Inline HTML themer ──────────────────────────────────────────────────────
const THEME_STYLE = `<style id="mehewara-theme">
.mehewara-content *{font-family:var(--mhw-font,"Noto Sans Sinhala","Space Grotesk",system-ui,sans-serif)!important;color:var(--color-text-primary)!important;background-color:transparent!important;border-color:var(--color-border)!important}
.mehewara-content{color:var(--color-text-primary);line-height:1.8;font-size:.9rem}
.mehewara-content h1,.mehewara-content h2,.mehewara-content h3,.mehewara-content h4,.mehewara-content h5,.mehewara-content h6{color:var(--color-text-primary)!important;font-weight:700;margin-top:1.5em;margin-bottom:.5em;line-height:1.3}
.mehewara-content h1{font-size:1.5rem}.mehewara-content h2{font-size:1.25rem;border-bottom:1px solid var(--color-border);padding-bottom:.35em}.mehewara-content h3{font-size:1.1rem}
.mehewara-content p{margin-bottom:.9em;color:var(--color-text-primary)!important}
.mehewara-content a{color:#38bdf8!important;text-decoration:underline}
.mehewara-content table{width:100%;border-collapse:collapse;margin-bottom:1.2em;font-size:.85rem}
.mehewara-content th{background-color:var(--color-surface)!important;color:var(--color-text-primary)!important;font-weight:600;padding:.5em .75em;border:1px solid var(--color-border)!important;text-align:left}
.mehewara-content td{padding:.45em .75em;border:1px solid var(--color-border)!important;color:var(--color-text-primary)!important;background-color:transparent!important}
.mehewara-content tr:nth-child(even) td{background-color:var(--color-surface)!important}
.mehewara-content ul,.mehewara-content ol{padding-left:1.5em;margin-bottom:.9em}
.mehewara-content li{margin-bottom:.3em;color:var(--color-text-primary)!important}
.mehewara-content code,.mehewara-content pre{font-family:"JetBrains Mono",monospace!important;font-size:.82em;background-color:var(--color-surface)!important;color:#38bdf8!important;border-radius:6px;padding:.15em .4em}
.mehewara-content pre{padding:.9em 1em;overflow-x:auto;border:1px solid var(--color-border)}
.mehewara-content pre code{padding:0;background:none!important}
.mehewara-content blockquote{border-left:3px solid #38bdf8;margin-left:0;padding-left:1em;color:var(--color-text-secondary)!important;font-style:italic}
.mehewara-content img{max-width:100%;height:auto;border-radius:8px;margin:.5em 0}
.mehewara-content mark{background-color:rgba(56,189,248,.2)!important;color:var(--color-text-primary)!important;padding:0 .2em;border-radius:3px}
.mehewara-content hr{border:none;border-top:1px solid var(--color-border);margin:1.5em 0}
</style>`;

export function themeHtml(raw: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'text/html');

  // ── Attempt to extract and render quizData if this is a JS-rendered quiz ──
  const scripts = Array.from(doc.querySelectorAll('script'));
  let quizRendered = '';

  for (const script of scripts) {
    const src = script.textContent || '';

    // Use bracket-counting (not regex) to extract the full array.
    // Regex with *? fails when code snippets inside the data contain ];
    // which terminates a lazy match early; greedy *? can also overshoot on
    // files with multiple ]; occurrences. Bracket counting is always correct.
    const startMarker = 'const quizData = [';
    const startIdx = src.indexOf(startMarker);
    if (startIdx === -1) continue;

    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx + 'const quizData = '.length; i < src.length; i++) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
    if (endIdx === -1) continue;

    const arrayStr = src.slice(startIdx + 'const quizData = '.length, endIdx + 1);

    try {
      // eslint-disable-next-line no-new-func
      const quizData: Array<{
        id: number; part?: number; question: string;
        code?: string; options: string[]; correctIndex: number; explanation?: string;
      }> = new Function(`"use strict"; return (${arrayStr})`)();

      let html = '';
      let lastPart = 0;
      quizData.forEach((q) => {
        if (q.part && q.part !== lastPart) {
          lastPart = q.part;
          html += `<h2>Part ${q.part}</h2>`;
        }
        const esc = (s: string) => s
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        html += `<div class="mhw-question">`;
        html += `<p class="mhw-qnum">Q${q.id}. ${esc(q.question)}</p>`;
        if (q.code) {
          html += `<pre><code>${esc(q.code)}</code></pre>`;
        }
        html += `<ol type="A" class="mhw-options">`;
        q.options.forEach((opt, i) => {
          const isCorrect = i === q.correctIndex;
          html += `<li class="${isCorrect ? 'mhw-correct' : ''}">${esc(opt)}${isCorrect ? ' <span class="mhw-badge">\u2713</span>' : ''}</li>`;
        });
        html += `</ol>`;
        if (q.explanation) {
          html += `<div class="mhw-explanation"><strong>Explanation:</strong> ${esc(q.explanation)}</div>`;
        }
        html += `</div>`;
      });

      quizRendered = html;
      break;
    } catch (e) {
      console.warn('quizData parse failed:', e);
    }
  }

  // ── Strip scripts/styles ──
  doc.querySelectorAll('style, link[rel="stylesheet"], script').forEach(el => el.remove());

  // ── Strip colour/font inline styles ──
  doc.querySelectorAll('[style]').forEach(el => {
    const cleaned = (el.getAttribute('style') || '')
      .split(';')
      .filter(d => {
        const p = d.split(':')[0]?.trim().toLowerCase();
        return p && !['color', 'background', 'background-color', 'font-family', 'font-size'].includes(p) && !p.startsWith('border-color');
      })
      .join(';');
    cleaned.trim() ? el.setAttribute('style', cleaned) : el.removeAttribute('style');
  });
  ['bgcolor', 'color', 'face', 'size', 'text', 'link', 'vlink', 'alink'].forEach(attr =>
    doc.querySelectorAll(`[${attr}]`).forEach(el => el.removeAttribute(attr))
  );

  // Strip inline event handlers (onclick, onerror, onload, etc.) — XSS prevention
  doc.querySelectorAll('*').forEach(el => {
    const attrsToRemove: string[] = [];
    for (let i = 0; i < el.attributes.length; i++) {
      if (el.attributes[i].name.toLowerCase().startsWith('on')) {
        attrsToRemove.push(el.attributes[i].name);
      }
    }
    attrsToRemove.forEach(attr => el.removeAttribute(attr));
  });

  const staticHtml = doc.body?.innerHTML ?? doc.documentElement.innerHTML;
  const bodyHtml = quizRendered || staticHtml;

  const quizStyle = quizRendered ? `<style>
.mhw-question{border:1px solid var(--color-border);border-radius:10px;padding:1.2em 1.4em;margin-bottom:1.4em}
.mhw-qnum{font-weight:600;margin-bottom:.6em}
.mhw-options{padding-left:1.4em;margin:.5em 0}
.mhw-options li{padding:.35em .5em;margin-bottom:.3em;border-radius:6px}
.mhw-correct{background:rgba(16,185,129,.12)!important;color:var(--color-text-primary)!important;font-weight:600}
.mhw-badge{font-size:.7em;background:#10b981;color:#fff!important;padding:.1em .5em;border-radius:4px;margin-left:.4em;vertical-align:middle}
.mhw-explanation{margin-top:.8em;padding:.8em 1em;border-left:3px solid #38bdf8;font-size:.85em;opacity:.85}
img{max-width:100%;max-height:400px;object-fit:contain;height:auto;border-radius:8px;margin:.5em 0}
</style>` : '';

  return THEME_STYLE + quizStyle + bodyHtml;
}
