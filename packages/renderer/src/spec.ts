import { z } from "zod";

/**
 * Structured design of a carousel: what a free-text request ("calmer green, lighter headings,
 * numbers on the left") is translated into, and what the renderer consumes. Every field has a bounded
 * range so a model's output can never produce an unreadable or broken slide.
 */

const hex = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, "hex color like #1a2b3c");

const themeSchema = z.object({
  /** Page background. */
  bg: hex.default("#faf6f0"),
  /** Card / panel surface. */
  card: hex.default("#fdfbf7"),
  /** Body text. */
  ink: hex.default("#102d60"),
  /** Headings, numbers, frame. */
  primary: hex.default("#06327d"),
  /** Pills and decoration. */
  accent: hex.default("#fcc63e"),
  /** Text on accent. */
  onAccent: hex.default("#0b2c53"),
  /** Bottom bar and dark panels. */
  bar: hex.default("#0b2c60"),
  /** Text on the bar. */
  onBar: hex.default("#ffffff"),
  /** Other accent colors the account may use; each post picks one so posts do not all look alike. */
  accentAlternates: z.array(hex).max(4).default([])
});

const typeSchema = z.object({
  fontFamily: z.string().min(1).max(80).default("Noto Sans JP"),
  headWeight: z.number().int().min(300).max(900).default(800),
  bodyWeight: z.number().int().min(300).max(900).default(700),
  headScale: z.number().min(0.8).max(1.1).default(1),
  bodyScale: z.number().min(0.8).max(1.1).default(1),
  numScale: z.number().min(0.6).max(1.2).default(1),
  underlineHeads: z.boolean().default(false),
  /** em */
  letterSpacing: z.number().min(-0.02).max(0.1).default(0)
});

const alignSchema = z.enum(["left", "center", "right"]);

const layoutSchema = z.object({
  numberAlign: alignSchema.default("center"),
  headAlign: alignSchema.default("center"),
  bodyAlign: alignSchema.default("center"),
  frame: z.enum(["outline", "filled", "none"]).default("outline"),
  /** px */
  radius: z.number().int().min(0).max(64).default(40),
  decor: z.enum(["blobs", "dots", "stripes", "none"]).default("blobs"),
  /** Arrangement of the content pages: classic (stacked), split (number column + text column), banner (heading band on top). */
  structure: z.enum(["classic", "split", "banner"]).default("classic"),
  /** How much each post may deviate from this design: none / subtle (accent color, number side) / lively (+ underline, decoration). */
  variety: z.enum(["none", "subtle", "lively"]).default("subtle")
});

export const designSpecSchema = z.object({
  theme: themeSchema.default(() => themeSchema.parse({})),
  type: typeSchema.default(() => typeSchema.parse({})),
  layout: layoutSchema.default(() => layoutSchema.parse({}))
});
export type DesignSpec = z.infer<typeof designSpecSchema>;

export const DEFAULT_DESIGN_SPEC: DesignSpec = designSpecSchema.parse({});

const SECTIONS = { theme: themeSchema, type: typeSchema, layout: layoutSchema } as const;

/**
 * Merge a partial spec (typically from a model) into `base`. Each field is validated on its own:
 * a bad value is dropped and the rest of the patch still applies. Never mutates `base`.
 */
export function applySpecPatch(base: DesignSpec, patch: unknown): DesignSpec {
  const raw = (patch ?? {}) as Record<string, unknown>;
  const merged = { theme: { ...base.theme }, type: { ...base.type }, layout: { ...base.layout } };
  for (const [section, schema] of Object.entries(SECTIONS)) {
    const incoming = raw[section];
    if (typeof incoming !== "object" || incoming === null) continue;
    const target = merged[section as keyof typeof merged] as Record<string, unknown>;
    for (const [key, value] of Object.entries(incoming)) {
      const field = (schema.shape as Record<string, z.ZodType>)[key];
      const parsed = field?.safeParse(value);
      if (parsed?.success) target[key] = parsed.data;
    }
  }
  return merged;
}

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function rgb(color: string): [number, number, number] {
  const digits = color.replace("#", "");
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(color: string): number {
  const [r, g, b] = rgb(color).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (none) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const MIN_TEXT_CONTRAST = 4.5;
const MIN_LARGE_TEXT_CONTRAST = 3;

/** The foreground (kept if readable, else black or white) that reads best on `surface`. */
function readableOn(foreground: string, surface: string, minimum: number): string {
  if (contrastRatio(foreground, surface) >= minimum) return foreground;
  return contrastRatio("#111111", surface) >= contrastRatio("#ffffff", surface) ? "#111111" : "#ffffff";
}

/** Guardrail: swap any text color that would be hard to read on its surface. */
export function ensureReadable(spec: DesignSpec): DesignSpec {
  const t = spec.theme;
  const surface = contrastRatio(t.ink, t.card) < contrastRatio(t.ink, t.bg) ? t.card : t.bg;
  return {
    ...spec,
    theme: {
      ...t,
      ink: readableOn(t.ink, surface, MIN_TEXT_CONTRAST),
      primary: readableOn(t.primary, surface, MIN_LARGE_TEXT_CONTRAST),
      onAccent: readableOn(t.onAccent, t.accent, MIN_TEXT_CONTRAST),
      onBar: readableOn(t.onBar, t.bar, MIN_TEXT_CONTRAST)
    }
  };
}
