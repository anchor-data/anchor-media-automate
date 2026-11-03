import { z } from "zod";
import type { SlideFields, SlideImage, SlideImagePrompt } from "./index";

/**
 * Slide generation customization.
 *
 * Two layers, kept apart on purpose:
 * - DesignRules: account-wide ("global") rules that every post follows.
 * - PostCustomization: one-off instructions for a single post, entered before generation.
 * Both are turned into one structured config (buildGenerationConfig) for the AI, never free text only.
 */

export const SLIDE_PAGE_COUNT = 8;

const pageSchema = z.number().int().min(1).max(SLIDE_PAGE_COUNT);

/** A feature (graph, evidence) that can be switched on and optionally pinned to a page. */
const pageToggleSchema = z
  .object({
    enabled: z.boolean().default(false),
    page: pageSchema.nullable().default(null)
  })
  // A page only means something while the feature is on.
  .transform((toggle) => ({ enabled: toggle.enabled, page: toggle.enabled ? toggle.page : null }));
export type PageToggle = z.infer<typeof pageToggleSchema>;

export const IMAGE_MODES = ["auto", "none", "asset_only"] as const;
export const imageModeSchema = z.enum(IMAGE_MODES);
export type ImageMode = z.infer<typeof imageModeSchema>;

export const MAX_HIGHLIGHT_KEYWORDS = 5;

export const postCustomizationSchema = z
  .object({
    highlightKeywords: z
      .array(z.string())
      .max(MAX_HIGHLIGHT_KEYWORDS * 2)
      .default([])
      .transform((words) => [...new Set(words.map((word) => word.trim()).filter((word) => word.length > 0))])
      .pipe(z.array(z.string().max(30)).max(MAX_HIGHLIGHT_KEYWORDS)),
    graph: pageToggleSchema.default({ enabled: false, page: null }),
    evidence: pageToggleSchema.default({ enabled: false, page: null }),
    imageMode: imageModeSchema.default("auto"),
    /** Any string; a different seed nudges the agent toward a different layout/phrasing. */
    variationSeed: z.string().max(40).nullable().default(null),
    notes: z.string().max(500).default("")
  })
  .superRefine((value, ctx) => {
    if (value.graph.enabled && value.imageMode !== "auto") {
      ctx.addIssue({
        code: "custom",
        path: ["imageMode"],
        message: "グラフを入れるには画像モードを「自動」にしてください"
      });
    }
    if (value.graph.enabled && value.evidence.enabled && value.graph.page !== null && value.graph.page === value.evidence.page) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence", "page"],
        message: "グラフとエビデンスは別のページにしてください"
      });
    }
  });
export type PostCustomization = z.infer<typeof postCustomizationSchema>;
export type PostCustomizationInput = z.input<typeof postCustomizationSchema>;

export const EMPTY_CUSTOMIZATION: PostCustomization = postCustomizationSchema.parse({});

export function isCustomizationEmpty(customization: PostCustomization): boolean {
  return (
    customization.highlightKeywords.length === 0 &&
    !customization.graph.enabled &&
    !customization.evidence.enabled &&
    customization.imageMode === "auto" &&
    customization.variationSeed === null &&
    customization.notes.trim() === ""
  );
}

export const TITLE_POSITIONS = ["top", "center", "bottom"] as const;

/** Account-wide design rules. Persisted per account. */
export const designRulesSchema = z.object({
  fontFamily: z.string().max(80).default(""),
  titlePosition: z.enum(TITLE_POSITIONS).default("top"),
  /** How emphasis is expressed, e.g. "key phrase in brand color, never underline". */
  emphasisRule: z.string().max(300).default(""),
  /** Allowed color patterns (names or hex), one per entry. The agent picks among them per post. */
  colorPatterns: z.array(z.string().max(60)).max(8).default([]),
  allowEmoji: z.boolean().default(false),
  allowIcons: z.boolean().default(true),
  readabilityRules: z.string().max(300).default("")
});
export type DesignRules = z.infer<typeof designRulesSchema>;
export const DEFAULT_DESIGN_RULES: DesignRules = designRulesSchema.parse({});

/** Everything the generator receives: global rules, per-post instructions, and derived page requirements. */
export interface GenerationConfig {
  global: DesignRules;
  post: PostCustomization;
  /** Plain-language per-page requirements derived from `post`, in page order. */
  requirements: string[];
}

export function buildGenerationConfig(global: DesignRules, post: PostCustomization): GenerationConfig {
  const requirements: Array<{ page: number; text: string }> = [];
  if (post.graph.enabled) {
    requirements.push({
      page: post.graph.page ?? 0,
      text: post.graph.page
        ? `${post.graph.page}ページ目にグラフを入れる (その枚の画像として imagePrompts に登録)`
        : "いずれかのページにグラフを入れる (その枚の画像として imagePrompts に登録)"
    });
  }
  if (post.evidence.enabled) {
    requirements.push({
      page: post.evidence.page ?? 0,
      text: post.evidence.page
        ? `${post.evidence.page}ページ目にエビデンス (出典・数字・調査名) を本文に入れる`
        : "いずれかのページにエビデンス (出典・数字・調査名) を本文に入れる"
    });
  }
  return {
    global,
    post,
    requirements: requirements.sort((a, b) => a.page - b.page).map((item) => item.text)
  };
}

export interface CustomizationCheck {
  key: string;
  label: string;
  ok: boolean;
}

interface CheckableDeck {
  slides: SlideFields;
  images?: readonly SlideImage[];
  imagePrompts?: readonly SlideImagePrompt[];
}

const pageOfSlot = (slot: string): number => Number(slot.slice(1, 2));

/** Machine-verifiable parts of a customization; evidence/notes are instructions only and are not checked. */
export function checkCustomization(deck: CheckableDeck, customization: PostCustomization): CustomizationCheck[] {
  const checks: CustomizationCheck[] = [];
  const text = Object.values(deck.slides).join("\n");
  const images = deck.images ?? [];
  const prompts = deck.imagePrompts ?? [];

  for (const word of customization.highlightKeywords) {
    checks.push({ key: `keyword:${word}`, label: `強調語「${word}」を含む`, ok: text.includes(word) });
  }

  if (customization.graph.enabled) {
    const { page } = customization.graph;
    const slots = [...images.map((i) => i.slot), ...prompts.map((p) => p.slot)];
    const placed = page === null ? slots.length > 0 : slots.some((slot) => pageOfSlot(slot) === page);
    checks.push({
      key: "graph",
      label: page === null ? "グラフを入れる" : `${page}ページ目にグラフを入れる`,
      ok: placed
    });
  }

  if (customization.imageMode === "none") {
    checks.push({ key: "imageMode", label: "画像を使わない", ok: images.length === 0 && prompts.length === 0 });
  } else if (customization.imageMode === "asset_only") {
    checks.push({ key: "imageMode", label: "アップロード画像のみ使う (AI生成なし)", ok: prompts.length === 0 });
  }
  return checks;
}

export interface SlideFieldChange {
  field: string;
  before: string;
  after: string;
}

/** Changed text fields between two generations, in field order. */
export function diffSlides(before: SlideFields, after: SlideFields): SlideFieldChange[] {
  const previous = before as Record<string, string>;
  return Object.entries(after as Record<string, string>)
    .filter(([field, value]) => previous[field] !== value)
    .map(([field, value]) => ({ field, before: previous[field] ?? "", after: value }));
}

/** Outcome of the latest generation, shown on the editor as the preview/diff panel. */
export const generationReportSchema = z.object({
  at: z.string(),
  /** Changes versus the previous deck; empty on a first generation. */
  diff: z.array(z.object({ field: z.string(), before: z.string(), after: z.string() })),
  checks: z.array(z.object({ key: z.string(), label: z.string(), ok: z.boolean() }))
});
export type GenerationReport = z.infer<typeof generationReportSchema>;

const imageListSchema = z.array(z.object({ slot: z.string().regex(/^s[1-8]_image$/), assetId: z.string().min(1) }));

/**
 * Per-post look. Canva autofill cannot recolor a template, so the look varies through a generated
 * background image placed in the template's optional `s1_bg` … `s8_bg` image fields.
 */
export const BACKGROUND_SLOTS = Array.from({ length: SLIDE_PAGE_COUNT }, (_, index) => `s${index + 1}_bg`);

/** The background fields a brand template exposes, in page order. */
export function backgroundSlotsIn(templateFields: readonly string[]): string[] {
  const fields = new Set(templateFields);
  return BACKGROUND_SLOTS.filter((slot) => fields.has(slot));
}

/** What the agent decides: a palette and a motif. The image is generated from these. */
export const backgroundPlanSchema = z.object({
  palette: z.string().min(1).max(80),
  motif: z.string().min(1).max(300)
});
export type BackgroundPlan = z.infer<typeof backgroundPlanSchema>;

/** A plan plus the generated image, as stored on the post. */
export const storedBackgroundSchema = backgroundPlanSchema.extend({ assetId: z.string().min(1) });
export type StoredBackground = z.infer<typeof storedBackgroundSchema>;

export function sameBackground(a: BackgroundPlan, b: BackgroundPlan): boolean {
  const norm = (value: string) => value.trim().toLowerCase();
  return norm(a.palette) === norm(b.palette) && norm(a.motif) === norm(b.motif);
}

export interface DeckExtras {
  images: SlideImage[];
  customization: PostCustomization;
  report: GenerationReport | null;
  background: StoredBackground | null;
}

/**
 * `posts.slides_json` carries more than the 21 text fields: chosen images, the customization the
 * post was generated with, and the last generation report. Read all of them with safe fallbacks.
 */
export function deckExtrasFrom(slidesJson: unknown): DeckExtras {
  const raw = (slidesJson ?? {}) as Record<string, unknown>;
  const images = imageListSchema.safeParse(raw.images);
  const customization = postCustomizationSchema.safeParse(raw.customization);
  const report = generationReportSchema.safeParse(raw.report);
  const background = storedBackgroundSchema.safeParse(raw.background);
  return {
    images: images.success ? (images.data as SlideImage[]) : [],
    customization: customization.success ? customization.data : EMPTY_CUSTOMIZATION,
    report: report.success ? report.data : null,
    background: background.success ? background.data : null
  };
}

/** Inverse of deckExtrasFrom: the value to store in `posts.slides_json`. */
export function slidesJsonWith(
  slides: SlideFields,
  extras: {
    images: readonly SlideImage[];
    customization: PostCustomization;
    report?: GenerationReport | null;
    background?: StoredBackground | null;
  }
): Record<string, unknown> {
  return {
    ...slides,
    images: extras.images,
    customization: extras.customization,
    ...(extras.report ? { report: extras.report } : {}),
    ...(extras.background ? { background: extras.background } : {})
  };
}
