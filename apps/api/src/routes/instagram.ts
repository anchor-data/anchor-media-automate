import { Hono } from "hono";
import type { InstagramConnectionStatus } from "@ama/shared";
import { buildInstagramAuthorizeUrl, exchangeInstagramCode, type InstagramApp } from "@ama/integrations";
import { createRepo, type Bindings } from "../lib/env";
import { publishPost } from "../lib/instagram-publish";
import { createInstagramState, verifyInstagramState } from "../lib/instagram-state";

export const instagramRoutes = new Hono<{ Bindings: Bindings }>();

function instagramApp(env: Bindings, requestUrl: string): InstagramApp | null {
  if (!env.INSTAGRAM_APP_ID || !env.INSTAGRAM_APP_SECRET) return null;
  return {
    appId: env.INSTAGRAM_APP_ID,
    appSecret: env.INSTAGRAM_APP_SECRET,
    redirectUri: env.INSTAGRAM_REDIRECT_URI ?? `${new URL(requestUrl).origin}/api/instagram/callback`
  };
}

/** Where the browser lands after the Instagram redirect. */
function webRedirect(env: Bindings, result: "connected" | "error", detail?: string): string {
  const url = new URL("/agent/accounts", env.ALLOWED_ORIGIN ?? "http://localhost:3000");
  url.searchParams.set("instagram", result);
  if (detail) url.searchParams.set("reason", detail);
  return url.toString();
}

instagramRoutes.get("/accounts/:id/instagram", async (c) => {
  const repo = createRepo(c.env);
  const connection = await repo.getInstagramConnection(c.req.param("id"));
  const item: InstagramConnectionStatus = connection
    ? { connected: true, username: connection.username, expiresAt: connection.expiresAt }
    : { connected: false };
  return c.json({ item, configured: Boolean(c.env.INSTAGRAM_APP_ID && c.env.INSTAGRAM_APP_SECRET) });
});

/** Start the Instagram login for one account. The dashboard sends the user to the returned url. */
instagramRoutes.post("/accounts/:id/instagram/connect", async (c) => {
  const app = instagramApp(c.env, c.req.url);
  if (!app) return c.json({ error: "Instagram is not configured (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET)" }, 503);
  const accountId = c.req.param("id");
  if (!(await createRepo(c.env).getAccount(accountId))) return c.json({ error: "Account not found" }, 404);
  const state = await createInstagramState(app.appSecret, accountId);
  return c.json({ url: buildInstagramAuthorizeUrl(app, state) });
});

/** Instagram redirects here with `code` + `state`; stores the token and sends the user back to the dashboard. */
instagramRoutes.get("/instagram/callback", async (c) => {
  const app = instagramApp(c.env, c.req.url);
  if (!app) return c.redirect(webRedirect(c.env, "error", "not_configured"));
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (c.req.query("error") || !code || !state) return c.redirect(webRedirect(c.env, "error", "denied"));

  const accountId = await verifyInstagramState(app.appSecret, state);
  if (!accountId) return c.redirect(webRedirect(c.env, "error", "invalid_state"));

  const repo = createRepo(c.env);
  if (!(await repo.getAccount(accountId))) return c.redirect(webRedirect(c.env, "error", "account_not_found"));
  try {
    // Instagram appends "#_" to the code; it is not part of it.
    const grant = await exchangeInstagramCode(app, code.replace(/#_$/, ""));
    await repo.saveInstagramConnection({
      accountId,
      igUserId: grant.igUserId,
      username: grant.username,
      accessToken: grant.accessToken,
      expiresAt: grant.expiresAt
    });
    return c.redirect(webRedirect(c.env, "connected"));
  } catch (error) {
    console.error(`instagram connect failed for ${accountId}: ${error instanceof Error ? error.message : error}`);
    return c.redirect(webRedirect(c.env, "error", "exchange_failed"));
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
