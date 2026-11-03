import { Hono } from "hono";
import type { Repository } from "@ama/db";
import {
  createCreationAgent,
  validateDeck,
  type CreationRunInput,
  type CreationToolContext
} from "@ama/integrations";
import type { AgentRun, Idea, Post, SlideDeck } from "@ama/shared";
import {
  DEFAULT_STRUCTURE,
  addCost,
  captionWithHashtags,
  deckExtrasFrom,
  parseDeckSlides,
  slideFieldsSchemaFor,
  slidesJsonWith
} from "@ama/shared";
import { chatCostUsd } from "@ama/integrations";
import { requestSpecPatch, resolvePostDesign } from "@ama/renderer";
import { z } from "zod";
import { createCanva, createRepo, type Bindings } from "../lib/env";
import { discardGeneratedImages, generateDeckImages } from "../lib/generate-images";
import { renderPost } from "../lib/render";
import { keepOtherImages, mergeSinglePage } from "../lib/single-slide";

export const creationRoutes = new Hono<{ Bindings: Bindings }>();

function toolContext(repo: Repository): CreationToolContext {
  return {
    getIdea: (ideaId) => repo.getIdea(ideaId),
    getGuideline: (accountId) => repo.getActiveGuideline(accountId),
    listReferences: (accountId) => repo.listReferences(accountId),
    getJob: async (jobId) => (await repo.listJobs()).find((job) => job.id === jobId) ?? null,
    // Only "asset" images are offered for placement; "reference" sheets feed AI generation instead.
    listImageAssets: (accountId) => repo.listImageAssets(accountId, ["asset"]),
    getImageStylePrompt: async (accountId) => (await repo.getAccount(accountId))?.imageStylePrompt ?? ""
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

/** Run the creation agent, store the deck, then render it. Never throws: failures land on the post. */
export async function generatePost(
  env: Bindings,
  postId: string,
  input: CreationRunInput,
  kind: "creation" | "regenerate",
  /** 1-based page to regenerate on its own; everything else of the post stays as it is. */
  onlyPage?: number
): Promise<void> {
  const repo = createRepo(env);
  try {
    await repo.updatePost(postId, { generationStatus: "generating_copy", generationError: null });
    // A regenerated copy keeps the design the post already has.
    const stored = deckExtrasFrom((await repo.getPost(postId))?.post.slidesJson);
    // A post keeps its own structure; a new one takes the account's.
    const structure = stored.structure ?? (await repo.getAccount(input.accountId))?.design?.structure ?? DEFAULT_STRUCTURE;
    const agentOutput = await createCreationAgent({ openAiApiKey: env.OPENAI_API_KEY }).run({ ...input, structure }, toolContext(repo));
    const previousDeck = onlyPage !== undefined ? input.previousDeck : undefined;
    const deck = previousDeck ? mergeSinglePage(previousDeck, agentOutput.deck, onlyPage!) : agentOutput.deck;
    const output = { ...agentOutput, deck };
    const generated = await generateDeckImages(
      repo,
      { openAiApiKey: env.OPENAI_API_KEY, bucket: env.IMAGE_ASSETS },
      input.accountId,
      deck
    );
    const images = previousDeck ? keepOtherImages(stored.images, generated.images, onlyPage!) : generated.images;
    let costUsd = addCost({ copy: 0, images: 0, design: 0 }, "copy", output.costUsd);
    costUsd = addCost(costUsd, "images", generated.costUsd);
    // Regenerated copy keeps what the post already cost; the new run adds to it.
    costUsd = {
      copy: stored.costUsd.copy + costUsd.copy,
      images: stored.costUsd.images + costUsd.images,
      design: stored.costUsd.design
    };
    const post = await repo.updatePost(postId, {
      // Hashtags live inside the caption text; the separate list stays empty so there is one source of truth.
      // A single-page regeneration leaves the caption alone.
      ...(previousDeck ? {} : { caption: captionWithHashtags(deck.caption, deck.hashtags), hashtags: [] }),
      slidesJson: slidesJsonWith(deck.slides, {
        images,
        design: stored.design,
        designPrompt: stored.designPrompt,
        costUsd,
        structure
      }),
      postType: deck.postType
    });
    const run: AgentRun = {
      id: `run_${crypto.randomUUID()}`,
      accountId: input.accountId,
      createdPostId: postId,
      kind,
      summary: output.summary,
      outputJson: { reasoning: [...output.reasoning, ...generated.warnings], ideaId: input.ideaId, costUsd: output.costUsd ?? null }
    };
    await repo.createAgentRun(run);
    // Only images that are no longer used go away (a single-page run keeps the other pages' images).
    const kept = new Set(images.map((image) => image.assetId));
    await discardGeneratedImages(repo, env.IMAGE_ASSETS, stored.images.filter((image) => !kept.has(image.assetId)));
    if (post) await renderPost(repo, createCanva(env, repo), post, { imageBucket: env.IMAGE_ASSETS });
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
    slides: z.record(z.string(), z.string()).optional()
  });
  const parsed = bodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  const { post } = detail;
  if (post.status !== "draft") return c.json({ error: `Only draft posts can be edited (is ${post.status})` }, 409);

  const current = parseDeckSlides(post.slidesJson);
  const structure = current?.structure ?? deckExtrasFrom(post.slidesJson).structure ?? DEFAULT_STRUCTURE;
  if (parsed.data.slides) {
    const checked = slideFieldsSchemaFor(structure).safeParse(parsed.data.slides);
    if (!checked.success) return c.json({ error: checked.error.flatten() }, 400);
  }
  const slides = parsed.data.slides ?? current?.slides;
  if (parsed.data.slides && post.ideaId && post.postType) {
    const idea = await repo.getIdea(post.ideaId);
    const guideline = idea ? await repo.getActiveGuideline(idea.accountId) : null;
    if (idea && guideline) {
      const deck = {
        postType: post.postType,
        slides: parsed.data.slides,
        images: deckExtrasFrom(post.slidesJson).images,
        caption: parsed.data.caption ?? post.caption,
        hashtags: parsed.data.hashtags ?? post.hashtags ?? []
      };
      const check = validateDeck(deck, { idea, guideline, structure });
      if (!check.ok) return c.json({ error: check.errors }, 422);
    }
  }

  const item = await repo.updatePost(post.id, {
    title: parsed.data.title,
    caption: parsed.data.caption,
    hashtags: parsed.data.hashtags,
    // Edited text keeps the post's design.
    slidesJson: slides ? slidesJsonWith(slides, deckExtrasFrom(post.slidesJson)) : undefined,
    // Edited slides make the stored assets stale until POST /posts/:id/render.
    ...(parsed.data.slides ? { generationStatus: "pending" as const } : {})
  });
  return c.json({ item, mode: repo.mode });
});

creationRoutes.post("/posts/:id/regenerate", async (c) => {
  const bodySchema = z.object({ feedback: z.string().max(1000).optional(), slideIndex: z.number().int().min(0).max(9).optional() });
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  const { post } = detail;
  if (!post.ideaId) return c.json({ error: "Post has no source idea to regenerate from" }, 422);
  if (post.status !== "draft") return c.json({ error: `Only draft posts can be regenerated (is ${post.status})` }, 409);

  const previous = parseDeckSlides(post.slidesJson);
  const extras = deckExtrasFrom(post.slidesJson);
  const pages = (extras.structure ?? DEFAULT_STRUCTURE).length;
  const slideIndex = parsed.data.slideIndex;
  if (slideIndex !== undefined && (slideIndex >= pages || !previous || !post.postType)) {
    return c.json({ error: "That slide cannot be regenerated on its own" }, 422);
  }
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
          previous && post.postType
            ? ({ postType: post.postType, slides: previous.slides, images: extras.images, caption: post.caption, hashtags: post.hashtags ?? [] } as SlideDeck)
            : undefined
      },
      "regenerate",
      slideIndex === undefined ? undefined : slideIndex + 1
    )
  );
  return c.json({ item: { ...post, generationStatus: "pending" }, mode: repo.mode }, 202);
});

/**
 * Another take on this post's design, then a fresh Canva render. With a prompt the free text is turned
 * into design changes (keeping the account's guideline in mind); without one the account design is
 * varied again. Text is untouched.
 */
creationRoutes.post("/posts/:id/design/regenerate", async (c) => {
  const parsed = z.object({ prompt: z.string().max(1000).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  const { post } = detail;
  if (post.status !== "draft") return c.json({ error: `Only draft posts can be redesigned (is ${post.status})` }, 409);
  const slides = parseDeckSlides(post.slidesJson);
  if (!slides) return c.json({ error: "Post has no slides to redesign yet" }, 409);
  const account = await repo.getAccount(post.accountId);
  if (!account) return c.json({ error: "Account not found" }, 404);

  const extras = deckExtrasFrom(post.slidesJson);
  const prompt = parsed.data.prompt?.trim() ?? "";
  let design;
  let costUsd = extras.costUsd;
  try {
    if (prompt) {
      const result = await requestSpecPatch({
        apiKey: c.env.OPENAI_API_KEY,
        request: prompt,
        current: resolvePostDesign(account.design?.spec, extras.design, post.id),
        guideline: account.design?.guideline
      });
      design = result.spec;
      costUsd = addCost(costUsd, "design", result.usage ? chatCostUsd(result.usage.model, result.usage) : null);
    } else {
      design = resolvePostDesign(account.design?.spec, null, `${post.id}:${Date.now()}`);
    }
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 502);
  }

  const updated = await repo.updatePost(post.id, {
    generationStatus: "pending",
    generationError: null,
    slidesJson: slidesJsonWith(slides.slides, { ...extras, design, designPrompt: prompt, costUsd })
  });
  if (!updated) return c.json({ error: "Post not found" }, 404);
  await runInBackground(c, renderPost(repo, createCanva(c.env, repo), updated, { imageBucket: c.env.IMAGE_ASSETS }).catch(() => undefined));
  return c.json({ item: updated, mode: repo.mode }, 202);
});

creationRoutes.post("/posts/:id/render", async (c) => {
  const bodySchema = z.object({ reexport: z.boolean().optional() });
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  try {
    await renderPost(repo, createCanva(c.env, repo), detail.post, { reexport: parsed.data.reexport, imageBucket: c.env.IMAGE_ASSETS });
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
