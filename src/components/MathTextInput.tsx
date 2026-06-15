/**
 * MathTextInput.tsx
 * Drop-in replacement for the option <input> fields in AdminPanel.
 *
 * Usage:
 *   <MathTextInput value={optA} onChange={setOptA} placeholder="Option A" />
 *
 * Install KaTeX first:
 *   npm install katex
 *   npm install --save-dev @types/katex
 *
 * Add to index.html <head>:
 *   <link rel="stylesheet"
 *         href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
 *         crossorigin="anonymous" />
 */

import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns true if a string looks like it contains a math expression */
function looksLikeMath(text: string): boolean {
  return [
    // Unicode math / Greek
    /[∫∑∏∂∇√∞±×÷≤≥≠≈∈∉⊂⊃∪∩αβγδεζηθικλμνξπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΠΡΣΤΥΦΧΨΩ]/,
    // Unicode superscripts
    /[²³¹⁰⁴⁵⁶⁷⁸⁹]/,
    // caret exponent
    /\^[\d\w({]/,
    // subscript underscore
    /[a-zA-Z]_[\d\w]/,
    // simple fraction
    /\d+\/\d+/,
    // LaTeX commands already typed
    /\\(frac|sqrt|sum|int|lim|sin|cos|tan|log|ln|alpha|beta|gamma|delta|theta|pi|sigma|omega|times|div|pm|leq|geq|neq|approx|infty)/,
    // trig / log functions
    /\b(sin|cos|tan|cot|sec|csc|log|ln|lim)\s*[(\w]/i,
  ].some(p => p.test(text));
}

/** Convert common Unicode math / Greek → LaTeX */
function toLatex(text: string): string {
  const GREEK: Record<string, string> = {
    α:'\\alpha',β:'\\beta',γ:'\\gamma',δ:'\\delta',ε:'\\epsilon',ζ:'\\zeta',
    η:'\\eta',θ:'\\theta',ι:'\\iota',κ:'\\kappa',λ:'\\lambda',μ:'\\mu',
    ν:'\\nu',ξ:'\\xi',π:'\\pi',ρ:'\\rho',σ:'\\sigma',τ:'\\tau',
    υ:'\\upsilon',φ:'\\phi',χ:'\\chi',ψ:'\\psi',ω:'\\omega',
    Γ:'\\Gamma',Δ:'\\Delta',Θ:'\\Theta',Λ:'\\Lambda',Ξ:'\\Xi',
    Π:'\\Pi',Σ:'\\Sigma',Υ:'\\Upsilon',Φ:'\\Phi',Ψ:'\\Psi',Ω:'\\Omega',
  };
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const SUB = '₀₁₂₃₄₅₆₇₈₉';

  return text
    // Unicode superscripts
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, m => `^{${[...m].map(c => SUP.indexOf(c)).join('')}}`)
    // Unicode subscripts
    .replace(/([₀₁₂₃₄₅₆₇₈₉]+)/g, m => `_{${[...m].map(c => SUB.indexOf(c)).join('')}}`)
    // Greek letters
    .replace(/[αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΥΦΨΩ]/g, c => GREEK[c] ?? c)
    // Operators
    .replace(/×/g,'\\times ').replace(/÷/g,'\\div ').replace(/±/g,'\\pm ')
    .replace(/≤/g,'\\leq ').replace(/≥/g,'\\geq ').replace(/≠/g,'\\neq ')
    .replace(/≈/g,'\\approx ').replace(/∞/g,'\\infty ')
    .replace(/√([^\s,;)]+)/g,'\\sqrt{$1}')
    .replace(/∫/g,'\\int ').replace(/∑/g,'\\sum ').replace(/∏/g,'\\prod ')
    .replace(/∂/g,'\\partial ').replace(/∇/g,'\\nabla ')
    // Simple fractions like 3/4 → \frac{3}{4}
    .replace(/\b(\d+)\/(\d+)\b/g,'\\frac{$1}{$2}')
    .trim();
}

/** Try to extract LaTeX from OMML XML (Word equation XML) */
function ommlToLatex(xml: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const math = doc.querySelector('oMath') ?? doc.querySelector('m\\:oMath');
    if (!math) return null;
    // Minimal: collect all text runs
    const text = Array.from(math.querySelectorAll('t, m\\:t'))
      .map(t => t.textContent ?? '').join('');
    return text.trim() ? toLatex(text.trim()) : null;
  } catch { return null; }
}

/** Try to extract LaTeX from MathML embedded in pasted HTML */
function mathmlToLatex(html: string): string | null {
  if (!/<math/i.test(html)) return null;
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const math = tmp.querySelector('math');
    if (!math) return null;
    return parseMML(math);
  } catch { return null; }
}

function parseMML(n: Element): string {
  const tag = n.tagName.toLowerCase().replace(/^.*:/, '');
  switch (tag) {
    case 'math': case 'mrow': case 'mstyle':
      return [...n.children].map(c => parseMML(c as Element)).join('');
    case 'mn': case 'mi': return n.textContent ?? '';
    case 'mo': return ` ${n.textContent} `;
    case 'mfrac':
      return `\\frac{${parseMML(n.children[0] as Element)}}{${parseMML(n.children[1] as Element)}}`;
    case 'msqrt':
      return `\\sqrt{${[...n.children].map(c => parseMML(c as Element)).join('')}}`;
    case 'mroot':
      return `\\sqrt[${parseMML(n.children[1] as Element)}]{${parseMML(n.children[0] as Element)}}`;
    case 'msup':
      return `${parseMML(n.children[0] as Element)}^{${parseMML(n.children[1] as Element)}}`;
    case 'msub':
      return `${parseMML(n.children[0] as Element)}_{${parseMML(n.children[1] as Element)}}`;
    case 'msubsup':
      return `${parseMML(n.children[0] as Element)}_{${parseMML(n.children[1] as Element)}}^{${parseMML(n.children[2] as Element)}}`;
    case 'mtext': return `\\text{${n.textContent}}`;
    default:
      return [...n.children].map(c => parseMML(c as Element)).join('');
  }
}

// ─── KaTeX inline renderer ─────────────────────────────────────────────────

function KatexSpan({ latex }: { latex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, {
        throwOnError: false,
        displayMode: false,
        strict: false,
      });
    } catch {
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex]);
  return <span ref={ref} />;
}

// ─── Exported value helper ────────────────────────────────────────────────

/** Wrap latex in $...$ for storage; plain text stays as-is */
export function wrapIfMath(value: string, isMath: boolean): string {
  if (!isMath) return value;
  const inner = value.startsWith('$') && value.endsWith('$') ? value.slice(1,-1) : value;
  return `$${inner}$`;
}

/** Strip $...$ wrapper if present */
export function unwrapMath(value: string): { raw: string; isMath: boolean } {
  if (value.startsWith('$') && value.endsWith('$') && value.length > 2) {
    return { raw: value.slice(1, -1), isMath: true };
  }
  return { raw: value, isMath: false };
}

// ─── Component ────────────────────────────────────────────────────────────

interface MathTextInputProps {
  value: string;                    // may be plain text OR $latex$
  onChange: (value: string) => void; // always stores $latex$ when math, plain otherwise
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function MathTextInput({
  value,
  onChange,
  placeholder = '',
  className = '',
  disabled = false,
}: MathTextInputProps) {
  const { raw: initRaw, isMath: initIsMath } = unwrapMath(value);
  const [raw, setRaw] = useState(initRaw);
  const [isMath, setIsMath] = useState(initIsMath);
  const [katexOk, setKatexOk] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep internal state in sync if parent value changes externally
  useEffect(() => {
    const { raw: r, isMath: m } = unwrapMath(value);
    setRaw(r);
    setIsMath(m);
  }, [value]);

  // Validate KaTeX silently
  useEffect(() => {
    if (!isMath || !raw) { setKatexOk(true); return; }
    try { katex.renderToString(raw, { throwOnError: true, strict: false }); setKatexOk(true); }
    catch { setKatexOk(false); }
  }, [raw, isMath]);

  // Push changes to parent
  const emit = (r: string, m: boolean) => {
    onChange(m ? `$${r}$` : r);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setRaw(v);
    emit(v, isMath);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const clip = e.clipboardData;

    // 1. OMML (Word XML)
    const xml = clip.getData('application/xml') || clip.getData('text/xml');
    if (xml && xml.includes('oMath')) {
      const latex = ommlToLatex(xml);
      if (latex) { e.preventDefault(); setRaw(latex); setIsMath(true); emit(latex, true); return; }
    }

    // 2. MathML in HTML
    const html = clip.getData('text/html');
    if (html && /<math/i.test(html)) {
      const latex = mathmlToLatex(html);
      if (latex) { e.preventDefault(); setRaw(latex); setIsMath(true); emit(latex, true); return; }
    }

    // 3. Plain text math detection
    const plain = clip.getData('text/plain');
    if (plain && looksLikeMath(plain)) {
      e.preventDefault();
      const latex = toLatex(plain.trim());
      setRaw(latex); setIsMath(true); emit(latex, true);
      return;
    }

    // 4. HTML text content fallback
    if (html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const txt = tmp.textContent ?? '';
      if (looksLikeMath(txt)) {
        e.preventDefault();
        const latex = toLatex(txt.trim());
        setRaw(latex); setIsMath(true); emit(latex, true);
        return;
      }
    }

    // 5. Plain text — clear math mode
    setIsMath(false);
  };

  const clearMath = () => {
    setIsMath(false);
    setRaw('');
    onChange('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const toggleMath = () => {
    const next = !isMath;
    setIsMath(next);
    emit(raw, next);
    if (!next) setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="math-text-input-root">
      {/* Input row */}
      <div className="math-text-input-row">
        <input
          ref={inputRef}
          type="text"
          value={raw}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder={isMath ? 'LaTeX source…' : placeholder}
          disabled={disabled}
          className={[
            'math-text-input',
            isMath ? 'math-text-input--eq' : '',
            className,
          ].filter(Boolean).join(' ')}
        />

        {/* Toggle button: ∑ icon when math, T when plain */}
        <button
          type="button"
          title={isMath ? 'Switch to plain text' : 'Mark as equation'}
          onClick={toggleMath}
          className={`math-text-toggle ${isMath ? 'math-text-toggle--active' : ''}`}
        >
          {isMath ? '∑' : 'T'}
        </button>
      </div>

      {/* Detected badge + preview */}
      {isMath && raw && (
        <div className="math-text-preview-row">
          {/* Rendered KaTeX */}
          <div className={`math-text-preview ${!katexOk ? 'math-text-preview--err' : ''}`}>
            {katexOk
              ? <KatexSpan latex={raw} />
              : <span className="math-text-preview-errtext">⚠ syntax error — check LaTeX</span>
            }
          </div>

          {/* Clear / revert link */}
          <button
            type="button"
            className="math-text-clear"
            onClick={clearMath}
          >
            ✕ clear
          </button>
        </div>
      )}

      {/* Auto-detected pill (shown once on first detection) */}
      {isMath && (
        <div className="math-text-badge">
          <span>⟨f⟩</span> සමීකරණය අනාවරණය විය — LaTeX ආකාරයෙන් සුරැකේ
        </div>
      )}
    </div>
  );
}

// ─── Inject styles once ───────────────────────────────────────────────────────
// Alternatively, move these into your global CSS or a MathTextInput.css file.
if (typeof document !== 'undefined' && !document.getElementById('math-text-input-styles')) {
  const s = document.createElement('style');
  s.id = 'math-text-input-styles';
  s.textContent = `
.math-text-input-root {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.math-text-input-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

/* Light mode defaults */
.math-text-input {
  flex: 1;
  background: rgb(248 250 252); /* slate-50 */
  border: 1px solid rgb(203 213 225); /* slate-300 */
  border-radius: 0.75rem;
  padding: 0.5rem 0.75rem;
  color: rgb(15 23 42); /* slate-900 */
  font-size: 0.75rem;
  outline: none;
  transition: border-color 0.15s;
  min-width: 0;
}
html.dark .math-text-input {
  background: rgb(15 23 42); /* slate-900 */
  border-color: rgb(30 41 59); /* slate-800 */
  color: white;
}

.math-text-input:focus {
  border-color: rgb(14 165 233) !important; /* sky-500 */
}

.math-text-input--eq {
  font-family: 'Courier New', monospace;
  font-size: 0.72rem;
  border-color: rgb(99 102 241); /* indigo-500 */
  background: rgb(238 242 255 / 0.8); /* indigo-50 */
}
html.dark .math-text-input--eq {
  background: rgb(15 23 42 / 0.8);
}
.math-text-input--eq:focus {
  border-color: rgb(129 140 248) !important; /* indigo-400 */
}

/* ∑ / T toggle button */
.math-text-toggle {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(203 213 225);
  border-radius: 0.5rem;
  background: rgb(248 250 252);
  color: rgb(100 116 139); /* slate-500 */
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}
html.dark .math-text-toggle {
  border-color: rgb(30 41 59);
  background: rgb(15 23 42);
  color: rgb(148 163 184); /* slate-400 */
}

.math-text-toggle:hover {
  border-color: rgb(99 102 241);
  color: rgb(99 102 241);
}
html.dark .math-text-toggle:hover {
  color: rgb(165 180 252);
}

.math-text-toggle--active {
  background: rgb(99 102 241) !important;
  border-color: rgb(99 102 241) !important;
  color: white !important;
}

/* Preview row */
.math-text-preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.math-text-preview {
  flex: 1;
  padding: 5px 10px;
  background: rgb(248 250 252 / 0.8);
  border: 1px solid rgb(99 102 241 / 0.25);
  border-radius: 0.5rem;
  font-size: 0.85rem;
  color: rgb(15 23 42);
  overflow-x: auto;
}
html.dark .math-text-preview {
  background: rgb(15 23 42 / 0.6);
  color: white;
}

.math-text-preview--err {
  border-color: rgb(239 68 68 / 0.4);
  background: rgb(239 68 68 / 0.05);
}

.math-text-preview-errtext {
  font-size: 0.7rem;
  color: rgb(239 68 68);
}
html.dark .math-text-preview-errtext {
  color: rgb(252 165 165);
}

.math-text-clear {
  flex-shrink: 0;
  font-size: 0.65rem;
  color: rgb(100 116 139);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.1s;
}
html.dark .math-text-clear {
  color: rgb(148 163 184);
}

.math-text-clear:hover { 
  color: rgb(239 68 68); 
}
html.dark .math-text-clear:hover { 
  color: rgb(252 165 165); 
}

/* Auto-detected pill */
.math-text-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.65rem;
  color: rgb(99 102 241);
  padding: 2px 8px;
  background: rgb(99 102 241 / 0.07);
  border: 1px solid rgb(99 102 241 / 0.15);
  border-radius: 999px;
  width: fit-content;
}
html.dark .math-text-badge {
  color: rgb(165 180 252);
}
  `;
  document.head.appendChild(s);
}