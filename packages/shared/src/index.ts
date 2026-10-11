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

export const postSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  title: z.string(),
  caption: z.string(),
  status: z.enum(["draft", "approved", "scheduled", "published"]),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Post = z.infer<typeof postSchema>;

export const postAssetSchema = z.object({
  id: z.string(),
  postId: z.string(),
  imageUrl: z.string().url(),
  canvaDesignId: z.string().optional()
});
export type PostAsset = z.infer<typeof postAssetSchema>;

export const agentRunSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  createdPostId: z.string(),
  summary: z.string(),
  outputJson: z.record(z.string(), z.unknown())
});
export type AgentRun = z.infer<typeof agentRunSchema>;

export const agentRunRequestSchema = z.object({
  accountId: z.string(),
  limit: z.number().int().positive().max(20).default(5)
});
export type AgentRunRequest = z.infer<typeof agentRunRequestSchema>;
