import { Hono } from "hono";
import { createRepository, type Repository } from "@ama/db";
import {
  createIdeationAgent,
  extractReferencePatterns,
  parseInstagramHandle,
  parseReferenceFile,
  ReferenceFileError,
  usedTopicKeys,
  withoutDuplicateIdeas,
  type IdeationToolContext
} from "@ama/integrations";
import type { AgentRun, IdeationRunRequest } from "@ama/shared";
import {
  guidelineUpsertSchema,
  ideationRunRequestSchema,
  referenceCreateSchema
} from "@ama/shared";
import { z } from "zod";

type Bindings = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  OPENAI_API_KEY?: string;
  /** Optional: keeps the original uploaded file. Without it only the extracted text is stored. */
  REFERENCE_FILES?: R2Bucket;
};

const referenceFileKey = (referenceId: string) => `references/${referenceId}`;

function createRepo(env: Bindings) {
  return createRepository({
    tursoUrl: env.TURSO_DATABASE_URL,
    tursoAuthToken: env.TURSO_AUTH_TOKEN
  });
}

/** Run the ideation agent, drop duplicate topics and store the rest as queued ideas. Throws on failure. */
export async function runIdeation(repo: Repository, openAiApiKey: string | undefined, input: IdeationRunRequest) {
  const agent = createIdeationAgent({ openAiApiKey });
  const tools: IdeationToolContext = {
    getGuideline: (accountId) => repo.getActiveGuideline(accountId),
    listReferences: (accountId) => repo.listReferences(accountId),
    getMemory: (accountId) => repo.listMemory(accountId),
    getPreviousPosts: (accountId, limit) => repo.listPostsByAccount(accountId, limit),
    getCandidateJobs: () => repo.listJobs(),
    listQueuedIdeas: (accountId) => repo.listIdeas(accountId)
  };

  const output = await agent.run(input, tools);
  const [memory, posts, existingIdeas] = await Promise.all([
    repo.listMemory(input.accountId),
    repo.listPostsByAccount(input.accountId, 50),
    repo.listIdeas(input.accountId)
  ]);
  const { kept, skipped } = withoutDuplicateIdeas(output.ideas, usedTopicKeys(memory, posts, existingIdeas));
  if (kept.length === 0) {
    throw new Error("No new ideas could be generated (all candidates duplicate existing topics)");
  }
  const ideas = await repo.createIdeas(kept);
  const reasoning =
    skipped.length > 0
      ? [...output.reasoning, `Stored only new ideas. Dropped duplicates: ${skipped.join(" / ")}`]
      : output.reasoning;
  const run: AgentRun = {
    id: `run_${crypto.randomUUID()}`,
    accountId: input.accountId,
    createdPostId: null,
    kind: "ideation",
    summary: output.summary,
    outputJson: { reasoning, ideaIds: ideas.map((i) => i.id) }
  };
  await repo.createAgentRun(run);

  return { mode: agent.mode, summary: output.summary, items: ideas, reasoning, agentRunId: run.id };
}

export const ideationRoutes = new Hono<{ Bindings: Bindings }>();

ideationRoutes.get("/accounts", async (c) => {
  const repo = createRepo(c.env);
  await repo.ensurePhase1Seed();
  return c.json({ items: await repo.listAccounts(), mode: repo.mode });
});

ideationRoutes.get("/accounts/:id/guideline", async (c) => {
  const repo = createRepo(c.env);
  const item = await repo.getActiveGuideline(c.req.param("id"));
  if (!item) return c.json({ error: "Guideline not found" }, 404);
  return c.json({ item, mode: repo.mode });
});

ideationRoutes.put("/accounts/:id/guideline", async (c) => {
  const parsed = guidelineUpsertSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);
  const item = await repo.upsertGuideline(account.id, parsed.data);
  return c.json({ item, mode: repo.mode });
});

ideationRoutes.get("/accounts/:id/references", async (c) => {
  const repo = createRepo(c.env);
  const kind = c.req.query("kind");
  const items = await repo.listReferences(
    c.req.param("id"),
    kind as Parameters<typeof repo.listReferences>[1]
  );
  return c.json({ items, mode: repo.mode });
});

ideationRoutes.post("/accounts/:id/references", async (c) => {
  const parsed = referenceCreateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);
  const item = await repo.createReference(account.id, parsed.data);
  return c.json({ item, mode: repo.mode }, 201);
});

ideationRoutes.post("/accounts/:id/reference-files", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "Missing file field" }, 400);
  const title = form.get("title");
  let parsed;
  try {
    parsed = parseReferenceFile({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      title: typeof title === "string" ? title : undefined
    });
  } catch (error) {
    if (error instanceof ReferenceFileError) return c.json({ error: error.message }, 400);
    throw error;
  }
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);
  const item = await repo.createReference(account.id, {
    kind: "doc",
    title: parsed.title,
    sourceNote: `file: ${file.name}${parsed.truncated ? " (truncated)" : ""}`,
    examplesText: parsed.text,
    active: true
  });
  if (c.env.REFERENCE_FILES) {
    try {
      await c.env.REFERENCE_FILES.put(referenceFileKey(item.id), await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || "text/plain" },
        customMetadata: { name: file.name, accountId: account.id }
      });
    } catch (error) {
      await repo.deleteReference(item.id);
      throw error;
    }
  }
  return c.json({ item, truncated: parsed.truncated, mode: repo.mode }, 201);
});

const instagramReferenceSchema = z.object({
  referenceUrl: z
    .string()
    .min(1)
    .refine((value) => parseInstagramHandle(value) !== null, "Enter an Instagram profile url or @handle"),
  /** Slides of the reference account's carousels (image data URLs or https URLs). */
  screenshots: z
    .array(z.string().refine((value) => value.startsWith("data:image/") || value.startsWith("https://")))
    .min(1)
    .max(10)
});

/** Read hook / slide / voice patterns from screenshots of a reference Instagram account into the library. */
ideationRoutes.post("/accounts/:id/references/from-instagram", async (c) => {
  const parsed = instagramReferenceSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);

  let drafts;
  try {
    drafts = await extractReferencePatterns({
      handle: `@${parseInstagramHandle(parsed.data.referenceUrl)}`,
      screenshots: parsed.data.screenshots,
      apiKey: c.env.OPENAI_API_KEY
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Could not read the screenshots" }, 502);
  }
  const items = [];
  for (const draft of drafts) items.push(await repo.createReference(account.id, draft));
  return c.json({ items, mode: repo.mode }, 201);
});

ideationRoutes.patch("/references/:id", async (c) => {
  const bodySchema = referenceCreateSchema.partial().extend({
    active: z.boolean().optional()
  });
  const parsed = bodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const repo = createRepo(c.env);
  const item = await repo.updateReference(c.req.param("id"), parsed.data);
  if (!item) return c.json({ error: "Reference not found" }, 404);
  return c.json({ item, mode: repo.mode });
});

ideationRoutes.delete("/references/:id", async (c) => {
  const repo = createRepo(c.env);
  const referenceId = c.req.param("id");
  const ok = await repo.deleteReference(referenceId);
  if (!ok) return c.json({ error: "Reference not found" }, 404);
  await c.env.REFERENCE_FILES?.delete(referenceFileKey(referenceId));
  return c.json({ ok: true });
});

ideationRoutes.get("/accounts/:id/memory", async (c) => {
  const repo = createRepo(c.env);
  const items = await repo.listMemory(c.req.param("id"));
  return c.json({ items, mode: repo.mode });
});

ideationRoutes.delete("/memory/:id", async (c) => {
  const repo = createRepo(c.env);
  const ok = await repo.deleteMemoryItem(c.req.param("id"));
  if (!ok) return c.json({ error: "Memory item not found" }, 404);
  return c.json({ ok: true });
});

ideationRoutes.get("/accounts/:id/ideas", async (c) => {
  const repo = createRepo(c.env);
  const status = c.req.query("status");
  const items = await repo.listIdeas(
    c.req.param("id"),
    status as Parameters<typeof repo.listIdeas>[1]
  );
  return c.json({ items, mode: repo.mode });
});

ideationRoutes.get("/ideas/:id", async (c) => {
  const repo = createRepo(c.env);
  const item = await repo.getIdea(c.req.param("id"));
  if (!item) return c.json({ error: "Idea not found" }, 404);
  return c.json({ item, mode: repo.mode });
});

ideationRoutes.patch("/ideas/:id", async (c) => {
  const bodySchema = z.object({
    status: z.enum(["queued", "selected", "rejected", "used"]).optional(),
    jobId: z.string().nullable().optional(),
    score: z.number().optional(),
    rationale: z.string().optional(),
    rejectReason: z.string().optional()
  });
  const parsed = bodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const repo = createRepo(c.env);
  const current = await repo.getIdea(c.req.param("id"));
  if (!current) return c.json({ error: "Idea not found" }, 404);

  const item = await repo.updateIdea(current.id, {
    status: parsed.data.status,
    jobId: parsed.data.jobId,
    score: parsed.data.score,
    rationale: parsed.data.rationale
  });

  if (parsed.data.status === "rejected") {
    await repo.createMemoryItem({
      accountId: current.accountId,
      kind: "idea_rejected",
      topicKey: current.topicKey,
      content: parsed.data.rejectReason ?? `Rejected: ${current.title}`,
      sourceIdeaId: current.id
    });
  }

  return c.json({ item, mode: repo.mode });
});

ideationRoutes.post("/ideation/run", async (c) => {
  const parsed = ideationRunRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  await repo.ensurePhase1Seed();
  const account = await repo.getAccount(parsed.data.accountId);
  if (!account) return c.json({ error: "Account not found" }, 404);

  try {
    const result = await runIdeation(repo, c.env.OPENAI_API_KEY, parsed.data);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ideation failed";
    return c.json({ error: message }, 500);
  }
});

ideationRoutes.post("/seed", async (c) => {
  const repo = createRepo(c.env);
  const result = await repo.ensurePhase1Seed();
  return c.json({ ...result, mode: repo.mode });
});
