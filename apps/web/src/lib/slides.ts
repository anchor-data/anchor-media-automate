import { DEFAULT_STRUCTURE, fieldKeys, type SlideFields, type SlideRole } from "@ama/shared";

export type SlideFieldKey = string;

export interface SlideFieldDef {
  readonly key: SlideFieldKey;
  readonly label: string;
}

export interface SlideDef {
  readonly index: number;
  readonly role: string;
  readonly fields: readonly SlideFieldDef[];
}

export const ROLE_LABEL: Record<SlideRole, string> = {
  cover: "フック",
  empathy: "課題",
  point: "要点",
  pick: "まとめ",
  cta: "CTA"
};

const FIELD_LABEL: Record<string, string> = {
  title: "見出し",
  sub: "サブ",
  head: "見出し",
  body: "本文",
  num: "番号",
  label: "ラベル",
  cta: "ボタン文言"
};

/** The pages of a carousel for a structure, with the text fields each one carries. */
export function slideDefs(structure: readonly SlideRole[] = DEFAULT_STRUCTURE): readonly SlideDef[] {
  const keys = fieldKeys(structure);
  const total = structure.filter((role) => role === "point").length;
  let point = 0;
  return structure.map((role, i) => {
    const label = role === "point" ? (point += 1, total > 1 ? `要点${point}` : "要点") : ROLE_LABEL[role];
    return {
      index: i + 1,
      role: label,
      fields: keys.filter((f) => f.page === i + 1).map((f) => ({ key: f.key, label: FIELD_LABEL[f.name] ?? f.name }))
    };
  });
}

/** The default 8-page deck. */
export const SLIDES: readonly SlideDef[] = slideDefs();

export function limitOf(key: SlideFieldKey, structure: readonly SlideRole[] = DEFAULT_STRUCTURE): number {
  return fieldKeys(structure).find((f) => f.key === key)?.max ?? 0;
}

/** Headline shown on a slide tile: the first non-empty text field. */
export function slideHeadline(slides: SlideFields | undefined, index: number, structure: readonly SlideRole[] = DEFAULT_STRUCTURE): string {
  if (!slides) return "";
  const def = slideDefs(structure)[index];
  if (!def) return "";
  const field = def.fields.find((f) => f.key.endsWith("_title") || f.key.endsWith("_head")) ?? def.fields[0];
  return field ? (slides[field.key] ?? "") : "";
}
