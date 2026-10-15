import { Hono } from "hono";
import { createRepository } from "@ama/db";
import {
  createIdeationAgent,
  type IdeationToolContext
} from "@ama/integrations";
import type { AgentRun } from "@ama/shared";
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
};

function createRepo(env: Bindings) {
  return createRepository({
    tursoUrl: env.TURSO_DATABASE_URL,
    tursoAuthToken: env.TURSO_AUTH_TOKEN
  });
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
  const ok = await repo.deleteReference(c.req.param("id"));
  if (!ok) return c.json({ error: "Reference not found" }, 404);
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

  const agent = createIdeationAgent({
    openAiApiKey: c.env.OPENAI_API_KEY
  });

  const tools: IdeationToolContext = {
    getGuideline: (accountId) => repo.getActiveGuideline(accountId),
    listReferences: (accountId) => repo.listReferences(accountId),
    getMemory: (accountId) => repo.listMemory(accountId),
    getPreviousPosts: (accountId, limit) => repo.listPostsByAccount(accountId, limit),
    getCandidateJobs: () => repo.listJobs(),
    listQueuedIdeas: (accountId) => repo.listIdeas(accountId, "queued")
  };

  try {
    const output = await agent.run(parsed.data, tools);
    const ideas = await repo.createIdeas(output.ideas);
    const run: AgentRun = {
      id: `run_${crypto.randomUUID()}`,
      accountId: parsed.data.accountId,
      createdPostId: null,
      kind: "ideation",
      summary: output.summary,
      outputJson: { reasoning: output.reasoning, ideaIds: ideas.map((i) => i.id) }
    };
    await repo.createAgentRun(run);

    return c.json({
      mode: agent.mode,
      summary: output.summary,
      items: ideas,
      reasoning: output.reasoning,
      agentRunId: run.id
    });
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
