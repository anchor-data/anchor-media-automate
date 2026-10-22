import { Hono } from "hono";
import type { Repository } from "@ama/db";
import {
  createCreationAgent,
  validateDeck,
  type CreationRunInput,
  type CreationToolContext
} from "@ama/integrations";
import type { AgentRun, Idea, Post, SlideDeck } from "@ama/shared";
import { slideFieldsSchema } from "@ama/shared";
import { z } from "zod";
import { createCanva, createRepo, type Bindings } from "../lib/env";
import { renderPost } from "../lib/render";

export const creationRoutes = new Hono<{ Bindings: Bindings }>();

function toolContext(repo: Repository): CreationToolContext {
  return {
    getIdea: (ideaId) => repo.getIdea(ideaId),
    getGuideline: (accountId) => repo.getActiveGuideline(accountId),
    listReferences: (accountId) => repo.listReferences(accountId),
    getJob: async (jobId) => (await repo.listJobs()).find((job) => job.id === jobId) ?? null
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

/** Run the creation agent, store the deck, then render it. Never throws: failures land on the post. */
async function generatePost(
  env: Bindings,
  postId: string,
  input: CreationRunInput,
  kind: "creation" | "regenerate"
): Promise<void> {
  const repo = createRepo(env);
  try {
    await repo.updatePost(postId, { generationStatus: "generating_copy", generationError: null });
    const output = await createCreationAgent({ openAiApiKey: env.OPENAI_API_KEY }).run(input, toolContext(repo));
    const post = await repo.updatePost(postId, {
      caption: output.deck.caption,
      hashtags: output.deck.hashtags,
      slidesJson: output.deck.slides,
      postType: output.deck.postType
    });
    const run: AgentRun = {
      id: `run_${crypto.randomUUID()}`,
      accountId: input.accountId,
      createdPostId: postId,
      kind,
      summary: output.summary,
      outputJson: { reasoning: output.reasoning, ideaId: input.ideaId }
    };
    await repo.createAgentRun(run);
    if (post) await renderPost(repo, createCanva(env, repo), post);
  } catch (error) {
    // renderPost already marks its own failures; this covers agent failures.
    await repo.updatePost(postId, { generationStatus: "failed", generationError: errorMessage(error) });
  }
}

/** Workers: keep running after the 202 response. Local/test runtimes without executionCtx run inline. */
async function runInBackground(c: { executionCtx: { waitUntil(promise: Promise<unknown>): void } }, task: Promise<void>): Promise<void> {
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    await task;
  }
}

creationRoutes.post("/ideas/:id/create", async (c) => {
  const repo = createRepo(c.env);
  const idea = await repo.getIdea(c.req.param("id"));
  if (!idea) return c.json({ error: "Idea not found" }, 404);
  if (idea.status === "used" || idea.status === "rejected") {
    return c.json({ error: `Idea is ${idea.status}` }, 409);
  }

  await repo.updateIdea(idea.id, { status: "selected" });
  const { post } = await repo.createPostDraft({
    accountId: idea.accountId,
    title: idea.title,
    caption: "",
    assets: [],
    ideaId: idea.id,
    generationStatus: "pending"
  });
  await runInBackground(c, generatePost(c.env, post.id, { ideaId: idea.id, accountId: idea.accountId }, "creation"));
  return c.json({ item: post, mode: repo.mode }, 202);
});

creationRoutes.patch("/posts/:id", async (c) => {
  const bodySchema = z.object({
    title: z.string().min(1).optional(),
    caption: z.string().max(2200).optional(),
    hashtags: z.array(z.string()).max(30).optional(),
    slides: slideFieldsSchema.optional()
  });
  const parsed = bodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  const { post } = detail;
  if (post.status !== "draft") return c.json({ error: `Only draft posts can be edited (is ${post.status})` }, 409);

  const slides = parsed.data.slides ?? slideFieldsSchema.safeParse(post.slidesJson).data;
  if (parsed.data.slides && post.ideaId && post.postType) {
    const idea = await repo.getIdea(post.ideaId);
    const guideline = idea ? await repo.getActiveGuideline(idea.accountId) : null;
    if (idea && guideline) {
      const deck: SlideDeck = {
        postType: post.postType,
        slides: parsed.data.slides,
        caption: parsed.data.caption ?? post.caption,
        hashtags: parsed.data.hashtags ?? post.hashtags ?? []
      };
      const check = validateDeck(deck, { idea, guideline });
      if (!check.ok) return c.json({ error: check.errors }, 422);
    }
  }

  const item = await repo.updatePost(post.id, {
    title: parsed.data.title,
    caption: parsed.data.caption,
    hashtags: parsed.data.hashtags,
    slidesJson: slides,
    // Edited slides make the stored assets stale until POST /posts/:id/render.
    ...(parsed.data.slides ? { generationStatus: "pending" as const } : {})
  });
  return c.json({ item, mode: repo.mode });
});

creationRoutes.post("/posts/:id/regenerate", async (c) => {
  const bodySchema = z.object({ feedback: z.string().optional() });
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  const { post } = detail;
  if (!post.ideaId) return c.json({ error: "Post has no source idea to regenerate from" }, 422);
  if (post.status !== "draft") return c.json({ error: `Only draft posts can be regenerated (is ${post.status})` }, 409);

  const previous = slideFieldsSchema.safeParse(post.slidesJson);
  await repo.updatePost(post.id, { generationStatus: "pending", generationError: null });
  await runInBackground(
    c,
    generatePost(
      c.env,
      post.id,
      {
        ideaId: post.ideaId,
        accountId: post.accountId,
        feedback: parsed.data.feedback,
        previousDeck:
          previous.success && post.postType
            ? { postType: post.postType, slides: previous.data, caption: post.caption, hashtags: post.hashtags ?? [] }
            : undefined
      },
      "regenerate"
    )
  );
  return c.json({ item: { ...post, generationStatus: "pending" }, mode: repo.mode }, 202);
});

creationRoutes.post("/posts/:id/render", async (c) => {
  const bodySchema = z.object({ reexport: z.boolean().optional() });
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  try {
    await renderPost(repo, createCanva(c.env, repo), detail.post, { reexport: parsed.data.reexport });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502);
  }
  return c.json({ ...(await repo.getPost(detail.post.id)), mode: repo.mode });
});

async function loadIdea(repo: Repository, post: Post): Promise<Idea | null> {
  return post.ideaId ? repo.getIdea(post.ideaId) : null;
}

creationRoutes.post("/posts/:id/approve", async (c) => {
  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  const { post } = detail;
  if (post.status !== "draft") return c.json({ error: `Only draft posts can be approved (is ${post.status})` }, 409);
  if (post.generationStatus && post.generationStatus !== "ready") {
    return c.json({ error: `Post is not ready (generation: ${post.generationStatus})` }, 409);
  }

  const item = await repo.setPostStatus(post.id, "approved");
  const idea = await loadIdea(repo, post);
  if (idea) {
    await repo.createMemoryItem({
      accountId: idea.accountId,
      kind: "topic_used",
      topicKey: idea.topicKey,
      content: `Approved: ${post.title}`,
      sourcePostId: post.id,
      sourceIdeaId: idea.id
    });
    if (idea.hook) {
      await repo.createMemoryItem({
        accountId: idea.accountId,
        kind: "hook_used",
        topicKey: idea.hook,
        content: idea.hook,
        sourcePostId: post.id,
        sourceIdeaId: idea.id
      });
    }
    await repo.updateIdea(idea.id, { status: "used" });
  }
  return c.json({ item, mode: repo.mode });
});

creationRoutes.post("/posts/:id/reject", async (c) => {
  const bodySchema = z.object({ reason: z.string().min(1) });
  const parsed = bodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  const { post } = detail;
  if (post.status !== "draft") return c.json({ error: `Only draft posts can be rejected (is ${post.status})` }, 409);

  const item = await repo.updatePost(post.id, { status: "rejected", rejectReason: parsed.data.reason });
  const idea = await loadIdea(repo, post);
  if (idea) {
    await repo.createMemoryItem({
      accountId: idea.accountId,
      kind: "idea_rejected",
      topicKey: idea.topicKey,
      content: parsed.data.reason,
      sourcePostId: post.id,
      sourceIdeaId: idea.id
    });
    await repo.updateIdea(idea.id, { status: "rejected" });
  }
  return c.json({ item, mode: repo.mode });
});

creationRoutes.post("/posts/:id/schedule", async (c) => {
  const bodySchema = z.object({ scheduledAt: z.iso.datetime({ offset: true }) });
  const parsed = bodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  if (detail.post.status !== "approved") {
    return c.json({ error: `Only approved posts can be scheduled (is ${detail.post.status})` }, 409);
  }
  // Persist only; publishing to Instagram is a later phase.
  await repo.updatePost(detail.post.id, { scheduledAt: parsed.data.scheduledAt });
  const item = await repo.setPostStatus(detail.post.id, "scheduled");
  return c.json({ item, mode: repo.mode });
});
