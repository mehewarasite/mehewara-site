import { parseTxtToQuizData } from './parseTxt';

export interface DiagnosticIssue {
  line: number;
  questionNumber?: number;
  message: string;
  snippet: string;
  severity: 'error' | 'warning';
}

export interface DiagnosticResult {
  isValid: boolean;
  errors: DiagnosticIssue[];
  warnings: DiagnosticIssue[];
  questions: Array<{
    id: number;
    part?: number;
    question: string;
    code?: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
  }>;
}

export function validateQuizText(rawContent: string): DiagnosticResult {
  const errors: DiagnosticIssue[] = [];
  const warnings: DiagnosticIssue[] = [];

  if (!rawContent || !rawContent.trim()) {
    return {
      isValid: false,
      errors: [{
        line: 1,
        message: 'File is empty.',
        snippet: '',
        severity: 'error',
      }],
      warnings: [],
      questions: [],
    };
  }

  let text = rawContent.trim();
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1).trim();
  }

  // 1. If it appears to be JSON, validate JSON syntax and schema
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsedJson = JSON.parse(text);
      let items: any[] = [];
      if (Array.isArray(parsedJson)) {
        items = parsedJson;
      } else if (parsedJson && typeof parsedJson === 'object') {
        items = parsedJson.questions || parsedJson.paper?.questions || parsedJson.items || parsedJson.data || [];
      }

      if (!Array.isArray(items) || items.length === 0) {
        errors.push({
          line: 1,
          message: 'JSON does not contain an array of questions (expected "questions" array).',
          snippet: text.slice(0, 100),
          severity: 'error',
        });
      } else {
        items.forEach((item, idx) => {
          const qNum = item.qNumber ?? item.question_number ?? item.number ?? (idx + 1);
          const qText = item.questionHtml ?? item.question_text ?? item.question ?? '';
          if (!qText || String(qText).trim().length === 0) {
            errors.push({
              line: idx + 1,
              questionNumber: qNum,
              message: `Question ${qNum} has empty question text.`,
              snippet: JSON.stringify(item).slice(0, 80),
              severity: 'error',
            });
          }

          const rawOpts = item.optionsHtml ?? item.options ?? [];
          if (!Array.isArray(rawOpts) || rawOpts.length < 4 || rawOpts.length > 5) {
            errors.push({
              line: idx + 1,
              questionNumber: qNum,
              message: `Question ${qNum} must have exactly 4 or 5 options (found ${Array.isArray(rawOpts) ? rawOpts.length : 0}).`,
              snippet: JSON.stringify(item).slice(0, 80),
              severity: 'error',
            });
          }

          let correctIdx = -1;
          if (typeof item.correctOption === 'number') correctIdx = item.correctOption;
          else if (typeof item.correct_option_index === 'number') correctIdx = item.correct_option_index;
          else if (Array.isArray(item.correctOptions) && item.correctOptions.length > 0) correctIdx = item.correctOptions[0];
          else if (Array.isArray(rawOpts)) {
            const fIdx = rawOpts.findIndex((o: any) => o && typeof o === 'object' && (o.isCorrect || o.is_correct));
            if (fIdx !== -1) correctIdx = fIdx;
          }

          if (correctIdx < 0 || (Array.isArray(rawOpts) && correctIdx >= rawOpts.length)) {
            errors.push({
              line: idx + 1,
              questionNumber: qNum,
              message: `Question ${qNum} does not specify a valid correct answer (index 0 to ${Array.isArray(rawOpts) ? rawOpts.length - 1 : 4}).`,
              snippet: JSON.stringify(item).slice(0, 80),
              severity: 'error',
            });
          }

          const exp = item.explanationHtml ?? item.explanation ?? '';
          if (!exp || String(exp).trim().length === 0) {
            warnings.push({
              line: idx + 1,
              questionNumber: qNum,
              message: `Question ${qNum} does not have an explanation.`,
              snippet: JSON.stringify(item).slice(0, 80),
              severity: 'warning',
            });
          }
        });
      }

      const parsedQuestions = parseTxtToQuizData(rawContent);
      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        questions: parsedQuestions,
      };
    } catch (e: any) {
      // JSON parse error details
      const match = e.message.match(/at position (\d+)/i);
      let lineNum = 1;
      let snippet = text.slice(0, 100);
      if (match) {
        const pos = parseInt(match[1], 10);
        const upToPos = text.slice(0, pos);
        lineNum = upToPos.split('\n').length;
        const lines = text.split('\n');
        snippet = lines[lineNum - 1] || text.slice(pos - 30, pos + 30);
      }
      errors.push({
        line: lineNum,
        message: `Invalid JSON syntax: ${e.message}`,
        snippet: snippet.trim(),
        severity: 'error',
      });

      return {
        isValid: false,
        errors,
        warnings,
        questions: [],
      };
    }
  }

  // 2. Validate Text Format line by line
  const lines = text.split('\n');
  let currentBlockStartLine = 1;
  let currentBlockLines: { lineNum: number; content: string }[] = [];
  let questionIndex = 0;

  const blocks: { startLine: number; lines: { lineNum: number; content: string }[] }[] = [];

  lines.forEach((rawLine, index) => {
    const lineNum = index + 1;
    const trimmed = rawLine.trim();

    // Check separator
    if (trimmed === '---' || /^\[\/?(EN|SIN)\]$/i.test(trimmed)) {
      if (currentBlockLines.length > 0) {
        blocks.push({ startLine: currentBlockStartLine, lines: [...currentBlockLines] });
        currentBlockLines = [];
      }
      currentBlockStartLine = lineNum + 1;
    } else if (trimmed.length > 0) {
      if (currentBlockLines.length === 0) {
        currentBlockStartLine = lineNum;
      }
      currentBlockLines.push({ lineNum, content: trimmed });
    }
  });

  if (currentBlockLines.length > 0) {
    blocks.push({ startLine: currentBlockStartLine, lines: currentBlockLines });
  }

  if (blocks.length === 0) {
    errors.push({
      line: 1,
      message: 'No question blocks found. Separate questions with "---" or "[SIN]".',
      snippet: lines[0] || '',
      severity: 'error',
    });
  }

  blocks.forEach((block) => {
    questionIndex++;
    let questionTextLines: string[] = [];
    let optionCount = 0;
    let foundCorrect = false;
    let hasExplanation = false;
    let inOptions = false;
    let inExplanation = false;

    block.lines.forEach(({ lineNum, content }) => {
      const lower = content.toLowerCase();

      // Check for answer declaration
      if (lower.startsWith('correct:') || lower.startsWith('answer:')) {
        foundCorrect = true;
        inOptions = false;
        inExplanation = false;
        const val = content.split(':')[1]?.trim() || '';
        if (!val || !/^[A-E1-5]$/i.test(val)) {
          errors.push({
            line: lineNum,
            questionNumber: questionIndex,
            message: `Invalid Answer value "${val}". Expected A-E or 1-5.`,
            snippet: content,
            severity: 'error',
          });
        }
        return;
      }

      // Check for explanation
      if (lower.startsWith('exp:') || lower.startsWith('explanation:')) {
        hasExplanation = true;
        inExplanation = true;
        inOptions = false;
        return;
      }

      // Check for option line: "A) ...", "*B) ...", "1. ...", "*1: ..."
      const optMatch = content.match(/^(\*?)([A-Ea-e]|\d+)[\):\.]\s+(.*)/);
      if (optMatch) {
        optionCount++;
        inOptions = true;
        inExplanation = false;
        if (optMatch[1] === '*') {
          foundCorrect = true;
        }
        const optBody = optMatch[3].trim();
        if (!optBody) {
          errors.push({
            line: lineNum,
            questionNumber: questionIndex,
            message: `Option ${optMatch[2]} has empty text.`,
            snippet: content,
            severity: 'error',
          });
        }
        return;
      }

      if (inExplanation) {
        // multiline explanation
      } else if (!inOptions) {
        questionTextLines.push(content);
      }
    });

    const fullQText = questionTextLines.join(' ').trim();
    if (!fullQText) {
      errors.push({
        line: block.startLine,
        questionNumber: questionIndex,
        message: `Question ${questionIndex} is missing question body text.`,
        snippet: block.lines[0]?.content || '',
        severity: 'error',
      });
    }

    if (optionCount < 4 || optionCount > 5) {
      errors.push({
        line: block.startLine,
        questionNumber: questionIndex,
        message: `Question ${questionIndex} has ${optionCount} options. Expected exactly 4 or 5 options.`,
        snippet: block.lines[0]?.content || '',
        severity: 'error',
      });
    }

    if (!foundCorrect) {
      errors.push({
        line: block.startLine,
        questionNumber: questionIndex,
        message: `Question ${questionIndex} has no correct answer marked (use '*' before the correct option or add 'Answer: C').`,
        snippet: block.lines[0]?.content || '',
        severity: 'error',
      });
    }

    if (!hasExplanation) {
      warnings.push({
        line: block.startLine,
        questionNumber: questionIndex,
        message: `Question ${questionIndex} has no explanation (optional).`,
        snippet: block.lines[0]?.content || '',
        severity: 'warning',
      });
    }

    // Check for image placeholder
    block.lines.forEach(({ lineNum, content }) => {
      if (/\[IMAGE:\s*(.*?)\]/i.test(content)) {
        warnings.push({
          line: lineNum,
          questionNumber: questionIndex,
          message: `Question ${questionIndex} contains an [IMAGE: ...] placeholder. Image must be uploaded in edit mode.`,
          snippet: content,
          severity: 'warning',
        });
      }
    });
  });

  const parsedQuestions = parseTxtToQuizData(rawContent);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    questions: parsedQuestions,
  };
}
