import { Hono } from "hono";
import type { Repository } from "@ama/db";
import type { InstagramConnectionStatus } from "@ama/shared";
import { z } from "zod";
import { connectInstagramToken } from "@ama/integrations";
import { createRepo, type Bindings } from "../lib/env";
import { publishPost } from "../lib/instagram-publish";

export const instagramRoutes = new Hono<{ Bindings: Bindings }>();

/** The account is named after its connected Instagram username. */
async function syncHandle(repo: Repository, accountId: string, username: string): Promise<void> {
  if (!username) return;
  const handle = `@${username}`;
  const account = await repo.getAccount(accountId);
  if (account && account.instagramHandle !== handle) await repo.updateAccountHandle(accountId, handle);
}

instagramRoutes.get("/accounts/:id/instagram", async (c) => {
  const repo = createRepo(c.env);
  const connection = await repo.getInstagramConnection(c.req.param("id"));
  if (connection) await syncHandle(repo, c.req.param("id"), connection.username);
  const item: InstagramConnectionStatus = connection
    ? { connected: true, username: connection.username, provider: connection.provider, expiresAt: connection.expiresAt }
    : { connected: false };
  return c.json({ item });
});

const connectBodySchema = z.object({
  accessToken: z.string().trim().min(1),
  igUserId: z.string().trim().regex(/^\d+$/).optional()
});

/** Connect one account with an access token generated in the Meta app dashboard. */
instagramRoutes.post("/accounts/:id/instagram/connect", async (c) => {
  const accountId = c.req.param("id");
  const parsed = connectBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "accessToken is required (igUserId must be numeric)" }, 400);
  const repo = createRepo(c.env);
  if (!(await repo.getAccount(accountId))) return c.json({ error: "Account not found" }, 404);
  try {
    const grant = await connectInstagramToken(parsed.data.accessToken, { igUserId: parsed.data.igUserId });
    await repo.saveInstagramConnection({
      accountId,
      igUserId: grant.igUserId,
      username: grant.username,
      accessToken: grant.accessToken,
      provider: grant.provider,
      expiresAt: grant.expiresAt
    });
    await syncHandle(repo, accountId, grant.username);
    const item: InstagramConnectionStatus = { connected: true, username: grant.username, provider: grant.provider, expiresAt: grant.expiresAt };
    return c.json({ item });
  } catch (error) {
    console.error(`instagram connect failed for ${accountId}: ${error instanceof Error ? error.message : error}`);
    return c.json({ error: error instanceof Error ? error.message : "Instagram connection failed" }, 400);
  }
});

instagramRoutes.delete("/accounts/:id/instagram", async (c) => {
  await createRepo(c.env).deleteInstagramConnection(c.req.param("id"));
  return c.json({ ok: true });
});

/** Publish an approved (or scheduled) post right now. */
instagramRoutes.post("/instagram/publish/:id", async (c) => {
  const repo = createRepo(c.env);
  const detail = await repo.getPost(c.req.param("id"));
  if (!detail) return c.json({ error: "Post not found" }, 404);
  if (detail.post.status !== "approved" && detail.post.status !== "scheduled") {
    return c.json({ error: `Only approved or scheduled posts can be published (is ${detail.post.status})` }, 422);
  }
  const outcome = await publishPost(c.env, repo, detail.post.id);
  if (!outcome.ok) return c.json({ error: outcome.error }, 502);
  return c.json({ item: (await repo.getPost(detail.post.id))?.post, permalink: outcome.permalink });
});
