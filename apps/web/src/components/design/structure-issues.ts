import { MAX_SLIDES, MIN_SLIDES, deckStructureSchema, type SlideRole } from "@ama/shared";

/** Problems with a structure, in Japanese (empty when it is valid). */
export function structureIssues(value: readonly SlideRole[]): string[] {
  const parsed = deckStructureSchema.safeParse(value);
  if (parsed.success) return [];
  return [...new Set(parsed.error.issues.map((issue) => issue.message))].map((message) =>
    message.includes("Too small") || message.includes("Too big") ? `ページ数は${MIN_SLIDES}〜${MAX_SLIDES}枚にしてください` : message
  );
}
