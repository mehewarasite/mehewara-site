import katex from 'katex';

const TARGET_API_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL)
  ? (import.meta as any).env.VITE_API_BASE_URL.replace(/\/+$/, '')
  : 'https://mehewara-v2-api-production.induwaradahamjith2004.workers.dev';

export function normalizeHtmlMediaUrls(html: string): string {
  if (!html) return html;
  return html
    .replace(/https?:\/\/[^/]+\/api\/v1\/media\//g, `${TARGET_API_URL}/api/v1/media/`)
    .replace(/src=["']\/api\/v1\/media\//g, `src="${TARGET_API_URL}/api/v1/media/`);
}

export function renderMathInHtml(text: string): string {
  if (!text) return text;
  const normalized = normalizeHtmlMediaUrls(text);
  return normalized.replace(/\$(.*?)\$/g, (match, latex) => {
    try {
      const rendered = katex.renderToString(latex.trim(), { throwOnError: false, displayMode: false });
      return `<span class="mhw-eq">${rendered}</span>`;
    } catch (e) {
      console.warn("KaTeX render error for:", latex);
      return match;
    }
  });
}

export function unrenderMathHtml(html: string): string {
  if (!html) return html;
  if (!html.includes('mhw-eq')) return html;
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const eqSpans = doc.querySelectorAll('span.mhw-eq');
    eqSpans.forEach(span => {
      const annotation = span.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation && annotation.textContent) {
        const textNode = doc.createTextNode(`$${annotation.textContent}$`);
        span.parentNode?.replaceChild(textNode, span);
      }
    });
    return doc.body.firstElementChild?.innerHTML || html;
  } catch (e) {
    console.error("Failed to unrender math:", e);
    return html;
  }
}

export function parseTxtToQuizData(text: string): Array<{
  id: number;
  part?: number;
  question: string;
  code?: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}> {
  if (!text) return [];

  const processText = (str: string) => {
    if (!str) return str;
    return str.replace(/\[IMAGE:\s*(.*?)\]/gi, (_, filename) => {
      const trimmed = filename.trim();
      return `<div class="image-placeholder bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 my-4 font-mono text-sm">Image Placeholder: ${trimmed}<br/><span class="text-xs">Upload image in Edit mode</span></div>`;
    });
  };

  // 1. Try parsing as JSON first (New JSON format support)
  try {
    const jsonObj = JSON.parse(text);
    if (Array.isArray(jsonObj) && jsonObj.length > 0) {
      // Map JSON to the expected QuizData format
      return jsonObj.map((item, index) => ({
        id: item.question_number ?? (index + 1),
        part: item.part,
        question: processText((item.question_text ?? item.question ?? '').replace(/\n/g, '<br/>')),
        code: item.code,
        options: (item.options ?? []).map((opt: string) => processText(opt)),
        correctIndex: item.correct_option_index ?? 0,
        explanation: processText((item.explanation ?? '').replace(/\n/g, '<br/>'))
      }));
    }
  } catch (e) {
    // Not JSON, continue to parse as text
  }

  // 2. Pre-process the text to convert [EN], [/EN], [SIN], [/SIN] into separators
  // This cleanly splits language blocks without merging them.
  let preprocessed = text
    .replace(/\[\/?EN\]/gi, '\n---\n')
    .replace(/\[\/?SIN\]/gi, '\n---\n');

  // Split by '---' which acts as a question separator
  const blocks = preprocessed.split(/^---$/m).map(b => b.trim()).filter(Boolean);
  
  const parsed = [];
  let idCounter = 1;

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    let questionText = '';
    const options: string[] = [];
    let correctIndex = 0;
    let explanation = '';
    let isParsingOptions = false;
    let isParsingExplanation = false;

    for (const line of lines) {
      const lower = line.toLowerCase();
      
      // Parse Answer (Explicit line e.g. "Answer: C")
      if (lower.startsWith('correct:') || lower.startsWith('answer:')) {
        const val = line.split(':')[1].trim().toUpperCase();
        const charCode = val.charCodeAt(0);
        // A=65 -> 0, B=66 -> 1, 1=49 -> 0
        if (charCode >= 65 && charCode <= 69) {
          correctIndex = charCode - 65;
        } else if (charCode >= 49 && charCode <= 53) {
          correctIndex = charCode - 49;
        }
        isParsingOptions = false;
        continue;
      }

      // Parse Explanation
      if (lower.startsWith('exp:') || lower.startsWith('explanation:')) {
        explanation = line.substring(line.indexOf(':') + 1).trim();
        isParsingExplanation = true;
        isParsingOptions = false;
        continue;
      }

      // Parse Options with optional * indicator for correct answer
      // Matches: "A) Option", "A: Option", "A. Option", "*B: Option", "1) Option"
      const optMatch = line.match(/^(\*?)([A-Ea-e]|\d+)[\):\.]\s+(.*)/);
      if (optMatch) {
        isParsingOptions = true;
        isParsingExplanation = false;
        const isCorrect = optMatch[1] === '*';
        const optLetter = optMatch[2].toUpperCase();
        const optText = optMatch[3].trim();
        
        options.push(optText);
        
        if (isCorrect) {
          const charCode = optLetter.charCodeAt(0);
          if (charCode >= 65 && charCode <= 69) {
            correctIndex = charCode - 65;
          } else if (charCode >= 49 && charCode <= 53) {
            correctIndex = charCode - 49;
          }
        }
        continue;
      }

      // Continue parsing multiline explanation or question text
      if (isParsingExplanation) {
        explanation += '\n' + line;
      } else if (!isParsingOptions) {
        let cleanedLine = line;
        
        // Strip Q1:, 1. from the first line of the question text to avoid duplication
        if (!questionText) {
          cleanedLine = cleanedLine.replace(/^(Q\d+[:\.]\s*|\d+[\)\.]\s+)/i, '');
        }

        questionText += (questionText ? '\n' : '') + cleanedLine;
      }
    }

    if (questionText && options.length > 0) {
      parsed.push({
        id: idCounter++,
        question: processText(questionText.replace(/\n/g, '<br/>')),
        options: options.map(opt => processText(opt)),
        correctIndex,
        explanation: explanation ? processText(explanation.replace(/\n/g, '<br/>')) : undefined
      });
    }
  }

  return parsed;
}
