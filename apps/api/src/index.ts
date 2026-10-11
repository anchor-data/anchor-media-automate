import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRepository } from "@ama/db";
import type { AgentRun, Post } from "@ama/shared";
import { agentRunRequestSchema } from "@ama/shared";
import {
  createAgentRunner,
  createCanvaClient,
  createInstagramClient
} from "@ama/integrations";
import { z } from "zod";

type Bindings = {
  AGENT_MODE?: "mock" | "openai";
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  OPENAI_API_KEY?: string;
  CANVA_API_KEY?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  ALLOWED_ORIGIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();
app.use("*", async (c, next) => {
  const origin = c.env.ALLOWED_ORIGIN ?? "*";
  return cors({ origin })(c, next);
});

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "ama-api",
    mode: c.env.AGENT_MODE ?? "mock",
    dataStore:
      c.env.TURSO_DATABASE_URL && c.env.TURSO_AUTH_TOKEN ? "turso" : "mock",
    integrations: {
      openai: Boolean(c.env.OPENAI_API_KEY),
      canva: Boolean(c.env.CANVA_API_KEY),
      instagram: Boolean(c.env.INSTAGRAM_ACCESS_TOKEN)
    }
  });
});

app.get("/jobs", async (c) => {
  const repo = createRepo(c.env);
  return c.json({ items: await repo.listJobs(), mode: repo.mode });
});

app.get("/posts", async (c) => {
  const repo = createRepo(c.env);
  return c.json({ items: await repo.listPosts(), mode: repo.mode });
});

app.get("/posts/:id", async (c) => {
  const repo = createRepo(c.env);
  const post = await repo.getPost(c.req.param("id"));
  if (!post) {
    return c.json({ error: "Post not found" }, 404);
  }
  return c.json(post);
});

app.post("/posts/:id/approve", async (c) => {
  const repo = createRepo(c.env);
  const post = await repo.setPostStatus(c.req.param("id"), "approved");
  if (!post) {
    return c.json({ error: "Post not found" }, 404);
  }
  return c.json({ item: post });
});

app.get("/accounts/:id/config", async (c) => {
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) {
    return c.json({ error: "Account not found" }, 404);
  }
  return c.json({ item: account, mode: repo.mode });
});

app.post("/agent/run", async (c) => {
  const parsed = agentRunRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const repo = createRepo(c.env);
  const runner = createAgentRunner({
    agentMode: c.env.AGENT_MODE ?? "mock",
    openAiApiKey: c.env.OPENAI_API_KEY
  });
  const canva = createCanvaClient({ canvaApiKey: c.env.CANVA_API_KEY });

  const output = await runner.run(parsed.data, {
    getCandidateJobs: async () => get_candidate_jobs(repo),
    getPreviousPosts: async (accountId, limit) => get_previous_posts(repo, accountId, limit),
    getAccountConfig: async (accountId) => get_account_config(repo, accountId),
    createPostDraft: async (input) => {
      const design = await canva.autofill({
        templateId: (await repo.getAccount(input.accountId))?.canvaTemplateId ?? "default_template",
        title: input.title,
        subtitle: input.caption
      });
      const exportUrl = await canva.getExportUrl(design.designId);
      const preview = create_post_draft_preview({
        ...input,
        assets: [{ imageUrl: exportUrl, canvaDesignId: design.designId }]
      });
      return { post: preview };
    },
    regeneratePost: async (post) => regenerate_post(runner, post)
  });

  const created = await create_post_draft(repo, output.post);
  const run: AgentRun = {
    id: `run_${crypto.randomUUID()}`,
    accountId: parsed.data.accountId,
    createdPostId: created.post.id,
    summary: output.summary,
    outputJson: {
      reasoning: output.reasoning,
      outputPost: output.post
    }
  };
  await repo.createAgentRun(run);

  return c.json({
    mode: runner.mode,
    summary: output.summary,
    item: created.post,
    assets: created.assets,
    reasoning: output.reasoning
  });
});

app.post("/agent/regenerate", async (c) => {
  const bodySchema = z.object({ postId: z.string().min(1) });
  const parsed = bodySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const repo = createRepo(c.env);
  const detail = await repo.getPost(parsed.data.postId);
  if (!detail) {
    return c.json({ error: "Post not found" }, 404);
  }

  const runner = createAgentRunner({
    agentMode: c.env.AGENT_MODE ?? "mock",
    openAiApiKey: c.env.OPENAI_API_KEY
  });
  const updated = await regenerate_post(runner, detail.post);
  const saved = await repo.updatePost(updated.id, {
    title: updated.title,
    caption: updated.caption,
    status: updated.status
  });
  return c.json({ item: saved ?? updated, mode: runner.mode });
});

app.post("/instagram/publish/:id", async (c) => {
  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  if (detail.post.status !== "approved") {
    return c.json({ error: "Only approved posts can be published" }, 422);
  }
  const instagram = createInstagramClient({
    instagramAccessToken: c.env.INSTAGRAM_ACCESS_TOKEN
  });
  const published = await instagram.publishCarousel({
    accountId: detail.post.accountId,
    caption: detail.post.caption,
    imageUrls: detail.assets.map((asset) => asset.imageUrl)
  });
  await repo.setPostStatus(detail.post.id, "published");
  return c.json({ item: published, mode: instagram.mode });
});

function createRepo(env: Bindings) {
  return createRepository({
    tursoUrl: env.TURSO_DATABASE_URL,
    tursoAuthToken: env.TURSO_AUTH_TOKEN
  });
}

async function get_candidate_jobs(repo: ReturnType<typeof createRepo>) {
  return repo.listJobs();
}

async function get_previous_posts(repo: ReturnType<typeof createRepo>, accountId: string, limit: number) {
  return repo.listPostsByAccount(accountId, limit);
}

async function get_account_config(repo: ReturnType<typeof createRepo>, accountId: string) {
  return repo.getAccount(accountId);
}

async function create_post_draft(
  repo: ReturnType<typeof createRepo>,
  input: {
    accountId: string;
    title: string;
    caption: string;
    assets: Array<{ imageUrl: string; canvaDesignId?: string }>;
  }
) {
  return repo.createPostDraft(input);
}

function create_post_draft_preview(input: {
  accountId: string;
  title: string;
  caption: string;
  assets: Array<{ imageUrl: string; canvaDesignId?: string }>;
}): Post {
  const now = new Date().toISOString();
  return {
    id: `preview_${crypto.randomUUID()}`,
    accountId: input.accountId,
    title: input.title,
    caption: input.caption,
    status: "draft",
    createdAt: now,
    updatedAt: now
  };
}

async function regenerate_post(
  runner: ReturnType<typeof createAgentRunner>,
  post: Post
) {
  return runner.regenerate(post, {
    getCandidateJobs: async () => [],
    getPreviousPosts: async () => [],
    getAccountConfig: async () => null,
    createPostDraft: async () => ({ post }),
    regeneratePost: async () => post
  });
}

export default app;
