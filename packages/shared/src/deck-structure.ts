import { z } from "zod";

/**
 * The pages of a carousel as an ordered list of roles. An account has a structure (3-10 pages,
 * a cover first and a CTA last); every post is generated, rendered and edited against it.
 *
 * Fields keep the `s{page}_{name}` keys the 8-page deck always used, so the default structure
 * produces exactly the same keys as before.
 */

export const SLIDE_ROLES = ["cover", "empathy", "point", "pick", "cta"] as const;
export type SlideRole = (typeof SLIDE_ROLES)[number];

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 10;

export interface RoleField {
  name: string;
  /** Max characters (Japanese, about one em each) that fit the layout. */
  max: number;
}

export const ROLE_FIELDS: Record<SlideRole, readonly RoleField[]> = {
  cover: [{ name: "title", max: 20 }, { name: "sub", max: 11 }],
  empathy: [{ name: "head", max: 6 }, { name: "body", max: 33 }],
  point: [{ name: "num", max: 1 }, { name: "head", max: 6 }, { name: "body", max: 42 }],
  pick: [{ name: "label", max: 4 }, { name: "head", max: 5 }, { name: "body", max: 36 }],
  cta: [{ name: "head", max: 8 }, { name: "cta", max: 7 }]
};

/** What each role is for, for people and for the creation agent. */
export const ROLE_PURPOSE: Record<SlideRole, string> = {
  cover: "cover / hook: the title that makes people stop",
  empathy: "empathy / problem: name the reader's worry",
  point: "know-how point: num is the point's number (\"1\", \"2\"...), then a short head and body",
  pick: "job pick OR summary fallback: label, head, body",
  cta: "call to action: head plus a short cta (e.g. follow / save)"
};

export const DEFAULT_STRUCTURE: SlideRole[] = ["cover", "empathy", "point", "point", "point", "point", "pick", "cta"];

export const deckStructureSchema = z
  .array(z.enum(SLIDE_ROLES))
  .min(MIN_SLIDES)
  .max(MAX_SLIDES)
  .superRefine((roles, ctx) => {
    if (roles[0] !== "cover") ctx.addIssue({ code: "custom", message: "最初のページはカバーにしてください" });
    if (roles[roles.length - 1] !== "cta") ctx.addIssue({ code: "custom", message: "最後のページはCTAにしてください" });
    if (!roles.includes("point")) ctx.addIssue({ code: "custom", message: "要点ページを1枚以上入れてください" });
  });

export interface FieldKey {
  key: string;
  page: number;
  role: SlideRole;
  name: string;
  max: number;
}

/** Every text field of a structure in page order. */
export function fieldKeys(structure: readonly SlideRole[]): FieldKey[] {
  return structure.flatMap((role, index) =>
    ROLE_FIELDS[role].map((field) => ({ key: `s${index + 1}_${field.name}`, page: index + 1, role, name: field.name, max: field.max }))
  );
}

/** Role of a page (1-based); null past the end. */
export function roleOf(structure: readonly SlideRole[], page: number): SlideRole | null {
  return structure[page - 1] ?? null;
}

/** Image field names, one per page (`s1_image` ...). */
export function imageSlotsFor(structure: readonly SlideRole[]): string[] {
  return structure.map((_, index) => `s${index + 1}_image`);
}

/** Zod object for a structure's text fields: all required, each limited to its role's capacity. */
export function slideFieldsSchemaFor(structure: readonly SlideRole[]) {
  return z.object(Object.fromEntries(fieldKeys(structure).map((f) => [f.key, z.string().max(f.max)])));
}

/** One line per page: role, purpose, and the fields to fill with their limits. */
export function describeStructure(structure: readonly SlideRole[]): string {
  return structure
    .map((role, index) => {
      const fields = ROLE_FIELDS[role].map((f) => `s${index + 1}_${f.name} (max ${f.max})`).join(", ");
      return `${index + 1}: ${role} — ${ROLE_PURPOSE[role]}; fields: ${fields}`;
    })
    .join("\n");
}
