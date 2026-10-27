import { z } from "zod";

export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  instagramHandle: z.string(),
  canvaTemplateId: z.string(),
  tone: z.string(),
  /** Periodic ideation + content creation. Off unless an operator enables it. */
  autoRunEnabled: z.boolean().optional(),
  /** One of AUTO_RUN_SCHEDULES (JST). */
  autoRunSchedule: z.string().optional(),
  lastAutoRunAt: z.string().nullable().optional(),
  /** Fixed image rules (subject, style, palette, background) prepended to every generated slide image prompt. */
  imageStylePrompt: z.string().optional()
});
export type Account = z.infer<typeof accountSchema>;

export const jobSchema = z.object({
  id: z.string(),
  company: z.string(),
  role: z.string(),
  location: z.string(),
  url: z.string().url()
});
export type Job = z.infer<typeof jobSchema>;

export const postStatusSchema = z.enum([
  "draft",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "failed"
]);
export type PostStatus = z.infer<typeof postStatusSchema>;

export const generationStatusSchema = z.enum([
  "pending",
  "generating_copy",
  "rendering",
  "ready",
  "failed"
]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const postTypeSchema = z.enum(["knowhow", "job_pick"]);
export type PostType = z.infer<typeof postTypeSchema>;

export const postSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  title: z.string(),
  caption: z.string(),
  status: postStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  ideaId: z.string().optional(),
  postType: postTypeSchema.optional(),
  slidesJson: z.unknown().optional(),
  hashtags: z.array(z.string()).optional(),
  scheduledAt: z.string().nullable().optional(),
  generationStatus: generationStatusSchema.optional(),
  generationError: z.string().nullable().optional(),
  rejectReason: z.string().nullable().optional()
});
export type Post = z.infer<typeof postSchema>;

export const postAssetSchema = z.object({
  id: z.string(),
  postId: z.string(),
  imageUrl: z.string().url(),
  canvaDesignId: z.string().optional(),
  slideIndex: z.number().int().min(0).max(7).optional(),
  templateId: z.string().optional()
});
export type PostAsset = z.infer<typeof postAssetSchema>;

export const agentRunSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  createdPostId: z.string().nullable().optional(),
  kind: z.enum(["ideation", "creation", "regenerate"]).optional(),
  summary: z.string(),
  outputJson: z.record(z.string(), z.unknown())
});
export type AgentRun = z.infer<typeof agentRunSchema>;

export const agentRunRequestSchema = z.object({
  accountId: z.string(),
  limit: z.number().int().positive().max(20).default(5)
});
export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>;

/** Human-uploaded account guideline (active version). */
export const guidelineSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  target: z.string(),
  concept: z.string(),
  tone: z.string(),
  contentPillars: z.array(z.string()),
  ngRules: z.array(z.string()),
  ctaPolicy: z.string(),
  hashtagPolicy: z.string(),
  jobPickEnabled: z.boolean(),
  systemPrompt: z.string(),
  version: z.number().int().positive(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Guideline = z.infer<typeof guidelineSchema>;

export const guidelineUpsertSchema = z.object({
  target: z.string().min(1),
  concept: z.string().min(1),
  tone: z.string().min(1),
  contentPillars: z.array(z.string()).default([]),
  ngRules: z.array(z.string()).default([]),
  ctaPolicy: z.string().default(""),
  hashtagPolicy: z.string().default(""),
  jobPickEnabled: z.boolean().default(false),
  systemPrompt: z.string().default("")
});
export type GuidelineUpsert = z.infer<typeof guidelineUpsertSchema>;

export const referenceKindSchema = z.enum([
  "slide_pattern",
  "hook_pattern",
  "voice_sample",
  "doc",
  "url_note"
]);
export type ReferenceKind = z.infer<typeof referenceKindSchema>;

/** Human-uploaded reference material for the agent. */
export const referenceSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  kind: referenceKindSchema,
  title: z.string(),
  sourceNote: z.string(),
  structureJson: z.unknown().nullable(),
  examplesText: z.string(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Reference = z.infer<typeof referenceSchema>;

export const referenceCreateSchema = z.object({
  kind: referenceKindSchema,
  title: z.string().min(1),
  sourceNote: z.string().default(""),
  structureJson: z.unknown().optional(),
  examplesText: z.string().default(""),
  active: z.boolean().default(true)
});
export type ReferenceCreate = z.infer<typeof referenceCreateSchema>;

export const memoryKindSchema = z.enum([
  "topic_used",
  "hook_used",
  "idea_rejected",
  "editor_feedback",
  "preference"
]);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

export const memoryItemSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  kind: memoryKindSchema,
  topicKey: z.string(),
  content: z.string(),
  sourcePostId: z.string().nullable().optional(),
  sourceIdeaId: z.string().nullable().optional(),
  createdAt: z.string()
});
export type MemoryItem = z.infer<typeof memoryItemSchema>;

export const ideaStatusSchema = z.enum(["queued", "selected", "rejected", "used"]);
export type IdeaStatus = z.infer<typeof ideaStatusSchema>;

export const ideaSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  title: z.string(),
  summary: z.string(),
  pillar: z.string(),
  topicKey: z.string(),
  hook: z.string(),
  angle: z.string(),
  referenceIds: z.array(z.string()),
  jobId: z.string().nullable().optional(),
  status: ideaStatusSchema,
  agentRunId: z.string().nullable().optional(),
  score: z.number().optional(),
  rationale: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Idea = z.infer<typeof ideaSchema>;

export const ideationRunRequestSchema = z.object({
  accountId: z.string(),
  count: z.number().int().positive().max(10).default(3),
  seedText: z.string().optional(),
  seedUrl: z.string().url().optional()
});
export type IdeationRunRequest = z.infer<typeof ideationRunRequestSchema>;

/**
 * Max characters per autofill field: what fits in the "wakaru carousel template" text boxes
 * (Japanese, about one em per character). Longer copy overflows its box after Canva autofill.
 */
export const SLIDE_FIELD_LIMITS = {
  s1_title: 20,
  s1_sub: 11,
  s2_head: 6,
  s2_body: 33,
  s3_num: 1,
  s3_head: 4,
  s3_body: 42,
  s4_num: 1,
  s4_head: 5,
  s4_body: 40,
  s5_num: 1,
  s5_head: 6,
  s5_body: 45,
  s6_num: 1,
  s6_head: 5,
  s6_body: 40,
  s7_label: 4,
  s7_head: 5,
  s7_body: 36,
  s8_head: 8,
  s8_cta: 7
} as const;

/** Validated 8-slide deck for Canva autofill (4:5 hybrid). */
export const slideFieldsSchema = z.object({
  s1_title: z.string().max(SLIDE_FIELD_LIMITS.s1_title),
  s1_sub: z.string().max(SLIDE_FIELD_LIMITS.s1_sub),
  s2_head: z.string().max(SLIDE_FIELD_LIMITS.s2_head),
  s2_body: z.string().max(SLIDE_FIELD_LIMITS.s2_body),
  s3_num: z.string().max(SLIDE_FIELD_LIMITS.s3_num),
  s3_head: z.string().max(SLIDE_FIELD_LIMITS.s3_head),
  s3_body: z.string().max(SLIDE_FIELD_LIMITS.s3_body),
  s4_num: z.string().max(SLIDE_FIELD_LIMITS.s4_num),
  s4_head: z.string().max(SLIDE_FIELD_LIMITS.s4_head),
  s4_body: z.string().max(SLIDE_FIELD_LIMITS.s4_body),
  s5_num: z.string().max(SLIDE_FIELD_LIMITS.s5_num),
  s5_head: z.string().max(SLIDE_FIELD_LIMITS.s5_head),
  s5_body: z.string().max(SLIDE_FIELD_LIMITS.s5_body),
  s6_num: z.string().max(SLIDE_FIELD_LIMITS.s6_num),
  s6_head: z.string().max(SLIDE_FIELD_LIMITS.s6_head),
  s6_body: z.string().max(SLIDE_FIELD_LIMITS.s6_body),
  s7_label: z.string().max(SLIDE_FIELD_LIMITS.s7_label),
  s7_head: z.string().max(SLIDE_FIELD_LIMITS.s7_head),
  s7_body: z.string().max(SLIDE_FIELD_LIMITS.s7_body),
  s8_head: z.string().max(SLIDE_FIELD_LIMITS.s8_head),
  s8_cta: z.string().max(SLIDE_FIELD_LIMITS.s8_cta)
});
export type SlideFields = z.infer<typeof slideFieldsSchema>;

/** Optional Canva image fields on the brand template, one per page (s1_image … s8_image). */
export const SLIDE_IMAGE_SLOTS = Array.from({ length: 8 }, (_, index) => `s${index + 1}_image`) as [
  string,
  ...string[]
];
export const slideImageSlotSchema = z.enum(SLIDE_IMAGE_SLOTS);

/** An uploaded image asset placed into one slide's image field. */
export const slideImageSchema = z.object({
  slot: slideImageSlotSchema,
  assetId: z.string().min(1)
});
export type SlideImage = z.infer<typeof slideImageSchema>;

/**
 * Images ride along in `posts.slides_json` next to the text fields. slideFieldsSchema strips them
 * on parse, so text handling is unaffected; use this to read them back.
 */
export function slideImagesFrom(slidesJson: unknown): SlideImage[] {
  const raw = (slidesJson as { images?: unknown } | null | undefined)?.images;
  const parsed = z.array(slideImageSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export const IMAGE_ASSET_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const IMAGE_ASSET_MAX_BYTES = 5_000_000;

/**
 * asset: placed into slides as-is (logo, photo).
 * reference: style/subject sample sent with every AI image generation.
 * generated: produced by the app for one post (hidden from the library).
 */
export const IMAGE_ASSET_KINDS = ["asset", "reference", "generated"] as const;

/** Human-uploaded image the creation agent may place into slides. Bytes live in R2. */
export const imageAssetSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  label: z.string(),
  description: z.string(),
  contentType: z.enum(IMAGE_ASSET_CONTENT_TYPES),
  kind: z.enum(IMAGE_ASSET_KINDS),
  sizeBytes: z.number().int().nonnegative(),
  /** Canva asset id once uploaded to Canva; reused on later renders. */
  canvaAssetId: z.string().nullable(),
  createdAt: z.string()
});
export type ImageAsset = z.infer<typeof imageAssetSchema>;

export const imageAssetCreateSchema = z.object({
  label: z.string().min(1).max(80),
  description: z.string().max(500).default(""),
  contentType: imageAssetSchema.shape.contentType,
  kind: imageAssetSchema.shape.kind.default("asset"),
  sizeBytes: z.number().int().nonnegative()
});
export type ImageAssetCreate = z.input<typeof imageAssetCreateSchema>;

/** Scene-only prompt for one slide; the account's fixed style prompt is prepended by the backend. */
export const slideImagePromptSchema = z.object({
  slot: slideImageSlotSchema,
  scene: z.string().min(1).max(400)
});
export type SlideImagePrompt = z.infer<typeof slideImagePromptSchema>;

export const slideDeckSchema = z.object({
  postType: postTypeSchema,
  slides: slideFieldsSchema,
  images: z.array(slideImageSchema).max(SLIDE_IMAGE_SLOTS.length).optional(),
  /** Slides whose image should be AI-generated; resolved into `images` before the post is stored. */
  imagePrompts: z.array(slideImagePromptSchema).max(SLIDE_IMAGE_SLOTS.length).optional(),
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).max(30)
});
export type SlideDeck = z.infer<typeof slideDeckSchema>;

export const AUTO_RUN_SCHEDULES = ["毎日 18:00", "毎日 12:00", "平日 9:00", "週3回 (火・木・土)"] as const;
export const DEFAULT_AUTO_RUN_SCHEDULE = AUTO_RUN_SCHEDULES[0];

export const autoRunSettingsSchema = z.object({
  enabled: z.boolean(),
  schedule: z.enum(AUTO_RUN_SCHEDULES)
});
export type AutoRunSettings = z.infer<typeof autoRunSettingsSchema>;

interface ScheduleSlot {
  /** 0 = Sunday … 6 = Saturday, in JST. */
  readonly days: readonly number[];
  readonly hour: number;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const SCHEDULE_SLOTS: Record<(typeof AUTO_RUN_SCHEDULES)[number], ScheduleSlot> = {
  "毎日 18:00": { days: ALL_DAYS, hour: 18 },
  "毎日 12:00": { days: ALL_DAYS, hour: 12 },
  "平日 9:00": { days: [1, 2, 3, 4, 5], hour: 9 },
  "週3回 (火・木・土)": { days: [2, 4, 6], hour: 18 }
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Start of the JST hour containing `at`, as epoch ms. */
function jstHourStart(at: Date): number {
  return Math.floor((at.getTime() + JST_OFFSET_MS) / HOUR_MS) * HOUR_MS - JST_OFFSET_MS;
}

/**
 * True when `now` falls in the JST hour the schedule targets and that hour has not run yet.
 * The cron fires hourly, so matching on the hour (not the minute) tolerates delayed triggers.
 */
export function isAutoRunDue(schedule: string, now: Date, lastRunAt: string | null | undefined): boolean {
  const slot = SCHEDULE_SLOTS[schedule as keyof typeof SCHEDULE_SLOTS];
  if (!slot) return false;
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  if (!slot.days.includes(jst.getUTCDay()) || jst.getUTCHours() !== slot.hour) return false;
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt);
  return Number.isNaN(last.getTime()) || last.getTime() < jstHourStart(now);
}

/**
 * The caption as posted: hashtags live inside the caption text, not in a separate field.
 * Tags the caption already contains are not repeated.
 */
export function captionWithHashtags(caption: string, hashtags: readonly string[]): string {
  const body = caption.trim();
  const missing = [
    ...new Set(
      hashtags
        .map((tag) => tag.trim().replace(/^[#＃]+/, ""))
        .filter((tag) => tag.length > 0)
        .map((tag) => `#${tag}`)
    )
  ].filter((tag) => !body.includes(tag));
  if (missing.length === 0) return body;
  return body ? `${body}\n\n${missing.join(" ")}` : missing.join(" ");
}
