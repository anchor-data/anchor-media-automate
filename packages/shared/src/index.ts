import { z } from "zod";

export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  instagramHandle: z.string(),
  canvaTemplateId: z.string(),
  tone: z.string()
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

/** Validated 8-slide deck for Canva autofill (4:5 hybrid). */
export const slideFieldsSchema = z.object({
  s1_title: z.string().max(22),
  s1_sub: z.string().max(24),
  s2_head: z.string().max(18),
  s2_body: z.string().max(60),
  s3_num: z.string().max(2),
  s3_head: z.string().max(16),
  s3_body: z.string().max(80),
  s4_num: z.string().max(2),
  s4_head: z.string().max(16),
  s4_body: z.string().max(80),
  s5_num: z.string().max(2),
  s5_head: z.string().max(16),
  s5_body: z.string().max(80),
  s6_num: z.string().max(2),
  s6_head: z.string().max(16),
  s6_body: z.string().max(80),
  s7_label: z.string().max(12),
  s7_head: z.string().max(20),
  s7_body: z.string().max(80),
  s8_head: z.string().max(40),
  s8_cta: z.string().max(24)
});
export type SlideFields = z.infer<typeof slideFieldsSchema>;

export const slideDeckSchema = z.object({
  postType: postTypeSchema,
  slides: slideFieldsSchema,
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).max(30)
});
export type SlideDeck = z.infer<typeof slideDeckSchema>;
