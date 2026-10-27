import { SLIDE_FIELD_LIMITS, type SlideFields } from "@ama/shared";

export type SlideFieldKey = keyof SlideFields;

export interface SlideFieldDef {
  readonly key: SlideFieldKey;
  readonly label: string;
}

export interface SlideDef {
  readonly index: number;
  readonly role: string;
  readonly fields: readonly SlideFieldDef[];
}

const numHeadBody = (n: number): readonly SlideFieldDef[] => [
  { key: `s${n}_num` as SlideFieldKey, label: "番号" },
  { key: `s${n}_head` as SlideFieldKey, label: "見出し" },
  { key: `s${n}_body` as SlideFieldKey, label: "本文" }
];

/** The 8 pages of the carousel and the Canva autofill fields each one carries. */
export const SLIDES: readonly SlideDef[] = [
  { index: 1, role: "フック", fields: [{ key: "s1_title", label: "見出し" }, { key: "s1_sub", label: "サブ" }] },
  { index: 2, role: "課題", fields: [{ key: "s2_head", label: "見出し" }, { key: "s2_body", label: "本文" }] },
  { index: 3, role: "要点1", fields: numHeadBody(3) },
  { index: 4, role: "要点2", fields: numHeadBody(4) },
  { index: 5, role: "要点3", fields: numHeadBody(5) },
  { index: 6, role: "要点4", fields: numHeadBody(6) },
  {
    index: 7,
    role: "求人 / まとめ",
    fields: [
      { key: "s7_label", label: "ラベル" },
      { key: "s7_head", label: "見出し" },
      { key: "s7_body", label: "本文" }
    ]
  },
  { index: 8, role: "CTA", fields: [{ key: "s8_head", label: "見出し" }, { key: "s8_cta", label: "ボタン文言" }] }
];

export function limitOf(key: SlideFieldKey): number {
  return SLIDE_FIELD_LIMITS[key];
}

/** Headline shown on a slide tile: the first non-empty text field. */
export function slideHeadline(slides: SlideFields | undefined, index: number): string {
  if (!slides) return "";
  const def = SLIDES[index];
  if (!def) return "";
  const field = def.fields.find((f) => f.key.endsWith("_title") || f.key.endsWith("_head")) ?? def.fields[0];
  return field ? (slides[field.key] ?? "") : "";
}

/** Every autofill field with its character limit, for the template field table. */
export const AUTOFILL_FIELDS: readonly { key: SlideFieldKey; label: string; limit: number }[] = SLIDES.flatMap((slide) =>
  slide.fields.map((field) => ({
    key: field.key,
    label: `${slide.index}枚目 ${slide.role} · ${field.label}`,
    limit: limitOf(field.key)
  }))
);
