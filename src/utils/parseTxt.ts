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

  // Split by '---' which acts as a question separator
  const blocks = text.split(/^---$/m).map(b => b.trim()).filter(Boolean);
  
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
      // Parse Answer
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

      // Parse Options
      if (/^([A-Ea-e]|\d+)[\)\.]\s+/.test(line)) {
        isParsingOptions = true;
        const optText = line.replace(/^([A-Ea-e]|\d+)[\)\.]\s*/, '').trim();
        options.push(optText);
        continue;
      }

      // Continue parsing multiline explanation or question text
      if (isParsingExplanation) {
        explanation += '\n' + line;
      } else if (!isParsingOptions) {
        questionText += (questionText ? '\n' : '') + line;
      }
    }

    if (questionText && options.length > 0) {
      parsed.push({
        id: idCounter++,
        question: questionText.replace(/\n/g, '<br/>'),
        options,
        correctIndex,
        explanation: explanation ? explanation.replace(/\n/g, '<br/>') : undefined
      });
    }
  }

  return parsed;
}
