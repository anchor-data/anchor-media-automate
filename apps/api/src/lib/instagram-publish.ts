import type { Repository } from "@ama/db";
import { publishInstagramCarousel, refreshInstagramToken } from "@ama/integrations";
import { createCanva, createRepo, type Bindings } from "./env";

/** Tokens expiring within this window are refreshed by the cron (tokens live ~60 days). */
const REFRESH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface PublishOutcome {
  readonly postId: string;
  readonly ok: boolean;
  readonly permalink?: string;
  readonly error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Publish failed";
}

/**
 * Canva export urls are short-lived, so a post scheduled days ahead gets fresh urls at publish
 * time (the export is cached for an hour). Posts without a Canva design use their stored urls.
 */
async function resolveImageUrls(
  env: Bindings,
  repo: Repository,
  assets: ReadonlyArray<{ imageUrl: string; canvaDesignId?: string }>
): Promise<string[]> {
  const designId = assets.find((a) => a.canvaDesignId)?.canvaDesignId;
  if (!designId) return assets.map((a) => a.imageUrl);
  const urls = await createCanva(env, repo).exportPages(designId);
  return urls.length === assets.length ? urls : assets.map((a) => a.imageUrl);
}

/** Publish one post to its account's Instagram. Records the outcome on the post and never throws. */
export async function publishPost(env: Bindings, repo: Repository, postId: string): Promise<PublishOutcome> {
  try {
    const detail = await repo.getPost(postId);
    if (!detail) throw new Error("Post not found");
    const connection = await repo.getInstagramConnection(detail.post.accountId);
    if (!connection) throw new Error("Instagram is not connected for this account");
    if (new Date(connection.expiresAt).getTime() <= Date.now()) {
      throw new Error("The Instagram connection has expired. Reconnect the account.");
    }
    const imageUrls = await resolveImageUrls(env, repo, detail.assets);
    const caption = [detail.post.caption, (detail.post.hashtags ?? []).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")]
      .filter(Boolean)
      .join("\n\n");
    const result = await publishInstagramCarousel({
      igUserId: connection.igUserId,
      accessToken: connection.accessToken,
      caption,
      imageUrls
    });
    await repo.markPostPublished(postId, { mediaId: result.mediaId, permalink: result.permalink });
    return { postId, ok: true, permalink: result.permalink };
  } catch (error) {
    const message = errorMessage(error);
    await repo.markPostPublishFailed(postId, message);
    return { postId, ok: false, error: message };
  }
}

/** Cron entry point: publish every scheduled post whose time has come. */
export async function publishDuePosts(env: Bindings, now: Date = new Date()): Promise<PublishOutcome[]> {
  const repo = createRepo(env);
  const due = await repo.listDueScheduledPosts(now.toISOString());
  const outcomes: PublishOutcome[] = [];
  // Sequential: Instagram rate-limits publishing and each carousel polls for processing.
  for (const post of due) outcomes.push(await publishPost(env, repo, post.id));
  return outcomes;
}

/** Cron entry point: extend tokens that are close to expiry. Returns the account ids that failed. */
export async function refreshExpiringTokens(env: Bindings, now: Date = new Date()): Promise<string[]> {
  const repo = createRepo(env);
  const expiring = await repo.listInstagramConnectionsExpiringBefore(new Date(now.getTime() + REFRESH_WINDOW_MS).toISOString());
  const failed: string[] = [];
  for (const connection of expiring) {
    try {
      const refreshed = await refreshInstagramToken(connection.accessToken, fetch, now);
      await repo.saveInstagramConnection({ ...connection, ...refreshed });
    } catch (error) {
      console.error(`instagram token refresh failed for ${connection.accountId}: ${errorMessage(error)}`);
      failed.push(connection.accountId);
    }
  }
  return failed;
}
