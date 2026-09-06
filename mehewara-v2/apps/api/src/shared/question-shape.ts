import { HttpError } from "./errors";

/**
 * Question/option answer-shape rules, shared by admin writes and backup
 * import. Option flags are the single source of truth: the
 * (answerMode/correctOptionIndexes/isAllCorrect) triple is always derived,
 * never trusted from input.
 */
export function normalizeAnswerShape(options: { isCorrect: boolean }[], isAllCorrect: boolean): { indexes: number[]; answerMode: "single" | "multiple" | "all" } {
  const indexes = options.map((option, index) => (option.isCorrect ? index : -1)).filter((index) => index >= 0);
  if (indexes.length === 0) throw new HttpError("BAD_REQUEST", 400, "At least one option must be correct");
  if (isAllCorrect && indexes.length !== options.length) {
    throw new HttpError("BAD_REQUEST", 400, "isAllCorrect requires every option to be correct");
  }
  return { indexes, answerMode: isAllCorrect ? "all" : indexes.length > 1 ? "multiple" : "single" };
}

export function checkOptionsShape(options: { id: unknown; sortOrder: unknown }[], optionCount: number): void {
  if (options.length !== optionCount) throw new HttpError("BAD_REQUEST", 400, "options length must equal optionCount");
  const orders = options.map((option) => option.sortOrder);
  const unique = new Set(orders);
  if (unique.size !== options.length || orders.some((order) => typeof order !== "number" || order < 0 || order >= options.length)) {
    throw new HttpError("BAD_REQUEST", 400, "option sortOrder values must be 0..n-1 with no duplicates");
  }
  const ids = new Set(options.map((option) => option.id));
  if (ids.size !== options.length) throw new HttpError("BAD_REQUEST", 400, "option ids must be unique");
}
