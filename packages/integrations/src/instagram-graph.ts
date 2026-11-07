/**
 * Instagram publishing over two token flavours, detected from the pasted token:
 *  - instagram_login (IGAA…): graph.instagram.com, ~60 day token that the cron refreshes.
 *  - facebook_login (EAA…, Unified login system-user token): graph.facebook.com, no expiry.
 * The publish flow (container -> status poll -> media_publish -> permalink) is identical, only
 * the host differs. Tokens are pasted from the Meta dashboard, so no app id / secret is needed.
 */

import type { InstagramProvider } from "@ama/shared";

export type { InstagramProvider };

const GRAPH_BASES: Record<InstagramProvider, string> = {
  instagram_login: "https://graph.instagram.com/v23.0",
  facebook_login: "https://graph.facebook.com/v26.0"
};

function graphBase(provider: InstagramProvider): string {
  return GRAPH_BASES[provider];
}

/** `EAA…` tokens come from Facebook/Unified login; anything else is an Instagram Login token. */
export function detectProvider(token: string): InstagramProvider {
  return token.trim().startsWith("EAA") ? "facebook_login" : "instagram_login";
}

export const CAROUSEL_MIN_ITEMS = 2;
export const CAROUSEL_MAX_ITEMS = 10;
const CONTAINER_POLL_INTERVAL_MS = 2000;
const CONTAINER_POLL_MAX_ATTEMPTS = 30;

export type InstagramTokenGrant = {
  accessToken: string;
  igUserId: string;
  username: string;
  provider: InstagramProvider;
  /** ISO timestamp the token stops working; null when the token never expires. */
  expiresAt: string | null;
};

export type InstagramPublishResult = { mediaId: string; permalink: string };

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

type Fetch = typeof fetch;

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Non-JSON error pages fall through to the status check below.
  }
  if (!response.ok) {
    const error = body.error as { message?: string; code?: number } | undefined;
    const code = typeof error?.code === "number" ? error.code : undefined;
    if (code === 190) {
      throw new InstagramApiError("トークンが無効か取り消されています。再接続してください", response.status, code);
    }
    if (code === 10 || code === 200) {
      throw new InstagramApiError(
        "権限が不足しています（必要な権限: instagram_basic, instagram_content_publish）",
        response.status,
        code
      );
    }
    const message = error?.message ?? (body.error_message as string | undefined) ?? text.slice(0, 200);
    throw new InstagramApiError(`Instagram API ${response.status}: ${message || "request failed"}`, response.status, code);
  }
  return body;
}

function expiryFrom(expiresInSeconds: unknown, now: Date): string {
  const seconds = typeof expiresInSeconds === "number" ? expiresInSeconds : 60 * 24 * 3600;
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

export type ConnectOptions = {
  /** Instagram account id; needed when the token can reach several accounts or none are assigned. */
  igUserId?: string;
};

/**
 * Accept an access token pasted from the Meta app dashboard and look up the account it belongs to.
 * Instagram Login tokens are long-lived (~60 days) but do not report their expiry, so the full
 * window is assumed (the cron refreshes near expiry). Unified login system-user tokens never expire.
 */
export async function connectInstagramToken(
  accessToken: string,
  options: ConnectOptions = {},
  fetchImpl: Fetch = fetch,
  now: Date = new Date()
): Promise<InstagramTokenGrant> {
  const token = accessToken.trim();
  if (!token) throw new InstagramApiError("An Instagram access token is required");
  const provider = detectProvider(token);

  if (provider === "instagram_login") {
    const profile = await graphGet("me", token, "user_id,username", fetchImpl, provider);
    const igUserId = String(profile.user_id ?? "");
    if (!igUserId) throw new InstagramApiError("Instagram did not return the account id");
    return {
      accessToken: token,
      igUserId,
      username: String(profile.username ?? ""),
      provider,
      expiresAt: expiryFrom(undefined, now)
    };
  }

  const igUserId = options.igUserId?.trim() || (await findAssignedAccountId(token, fetchImpl));
  const profile = await graphGet(igUserId, token, "id,username", fetchImpl, provider);
  return {
    accessToken: token,
    igUserId: String(profile.id ?? igUserId),
    username: String(profile.username ?? ""),
    provider,
    expiresAt: null
  };
}

async function findAssignedAccountId(token: string, fetchImpl: Fetch): Promise<string> {
  const body = await graphGet("me/assigned_instagram_accounts", token, "id,username", fetchImpl, "facebook_login");
  const accounts = Array.isArray(body.data) ? (body.data as Array<{ id?: unknown }>) : [];
  if (accounts.length === 0) {
    throw new InstagramApiError(
      "このトークンに割り当てられた Instagram アカウントがありません。IG ユーザー ID を指定してください"
    );
  }
  if (accounts.length > 1) {
    throw new InstagramApiError("複数の Instagram アカウントが見つかりました。IG ユーザー ID を指定してください");
  }
  const id = String(accounts[0]?.id ?? "");
  if (!id) throw new InstagramApiError("Instagram did not return the account id");
  return id;
}

/** Extend a long-lived instagram_login token by another ~60 days (not for facebook_login tokens). Only works on tokens older than 24 hours. */
export async function refreshInstagramToken(
  accessToken: string,
  fetchImpl: Fetch = fetch,
  now: Date = new Date()
): Promise<{ accessToken: string; expiresAt: string }> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const body = await readJson(await fetchImpl(url));
  if (typeof body.access_token !== "string") throw new InstagramApiError("Instagram did not return a refreshed token");
  return { accessToken: body.access_token, expiresAt: expiryFrom(body.expires_in, now) };
}

export type PublishCarouselInput = {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrls: string[];
  /** Defaults to instagram_login. */
  provider?: InstagramProvider;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
};

async function graphPost(
  path: string,
  accessToken: string,
  params: Record<string, string>,
  fetchImpl: Fetch,
  provider: InstagramProvider
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  return readJson(await fetchImpl(`${graphBase(provider)}/${path}`, { method: "POST", body }));
}

async function graphGet(
  path: string,
  accessToken: string,
  fields: string,
  fetchImpl: Fetch,
  provider: InstagramProvider
): Promise<Record<string, unknown>> {
  const url = new URL(`${graphBase(provider)}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  return readJson(await fetchImpl(url));
}

function requireId(body: Record<string, unknown>, what: string): string {
  if (typeof body.id !== "string") throw new InstagramApiError(`Instagram did not return ${what}`);
  return body.id;
}

async function waitForContainer(
  containerId: string,
  accessToken: string,
  fetchImpl: Fetch,
  sleep: (ms: number) => Promise<void>,
  provider: InstagramProvider
): Promise<void> {
  for (let attempt = 0; attempt < CONTAINER_POLL_MAX_ATTEMPTS; attempt += 1) {
    const { status_code: status } = await graphGet(containerId, accessToken, "status_code", fetchImpl, provider);
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new InstagramApiError(`Instagram could not process the media (${String(status)})`);
    }
    await sleep(CONTAINER_POLL_INTERVAL_MS);
  }
  throw new InstagramApiError("Timed out waiting for Instagram to process the media");
}

/** Publish a carousel of 2-10 public image urls to the connected account. */
export async function publishInstagramCarousel(input: PublishCarouselInput): Promise<InstagramPublishResult> {
  const { igUserId, accessToken, caption, imageUrls } = input;
  const provider = input.provider ?? "instagram_login";
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  if (imageUrls.length < CAROUSEL_MIN_ITEMS || imageUrls.length > CAROUSEL_MAX_ITEMS) {
    throw new InstagramApiError(
      `Instagram carousels need ${CAROUSEL_MIN_ITEMS}-${CAROUSEL_MAX_ITEMS} images (got ${imageUrls.length})`
    );
  }

  const childIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const child = await graphPost(
      `${igUserId}/media`,
      accessToken,
      { image_url: imageUrl, is_carousel_item: "true" },
      fetchImpl,
      provider
    );
    childIds.push(requireId(child, "a media container id"));
  }
  for (const childId of childIds) await waitForContainer(childId, accessToken, fetchImpl, sleep, provider);

  const carousel = await graphPost(
    `${igUserId}/media`,
    accessToken,
    { media_type: "CAROUSEL", children: childIds.join(","), caption },
    fetchImpl,
    provider
  );
  const carouselId = requireId(carousel, "a carousel container id");
  await waitForContainer(carouselId, accessToken, fetchImpl, sleep, provider);

  const published = await graphPost(`${igUserId}/media_publish`, accessToken, { creation_id: carouselId }, fetchImpl, provider);
  const mediaId = requireId(published, "the published media id");
  const { permalink } = await graphGet(mediaId, accessToken, "permalink", fetchImpl, provider);
  return { mediaId, permalink: typeof permalink === "string" ? permalink : "" };
}
