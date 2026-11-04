/**
 * Instagram API with Instagram Login (graph.instagram.com). One long-lived user token per
 * connected Instagram professional account; tokens last ~60 days and are refreshed before expiry.
 */

export const INSTAGRAM_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_URL = "https://graph.instagram.com";
const GRAPH_VERSION = "v23.0";
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"] as const;

export const CAROUSEL_MIN_ITEMS = 2;
export const CAROUSEL_MAX_ITEMS = 10;
const CONTAINER_POLL_INTERVAL_MS = 2000;
const CONTAINER_POLL_MAX_ATTEMPTS = 30;

export type InstagramApp = { appId: string; appSecret: string; redirectUri: string };

export type InstagramTokenGrant = {
  accessToken: string;
  igUserId: string;
  username: string;
  /** ISO timestamp the token stops working. */
  expiresAt: string;
};

export type InstagramPublishResult = { mediaId: string; permalink: string };

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

type Fetch = typeof fetch;

/** URL the user is sent to so they can grant the app access to their Instagram account. */
export function buildInstagramAuthorizeUrl(app: InstagramApp, state: string): string {
  const url = new URL(INSTAGRAM_AUTHORIZE_URL);
  url.searchParams.set("client_id", app.appId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Non-JSON error pages fall through to the status check below.
  }
  if (!response.ok) {
    const error = body.error as { message?: string } | undefined;
    const message = error?.message ?? (body.error_message as string | undefined) ?? text.slice(0, 200);
    throw new InstagramApiError(`Instagram API ${response.status}: ${message || "request failed"}`, response.status);
  }
  return body;
}

function expiryFrom(expiresInSeconds: unknown, now: Date): string {
  const seconds = typeof expiresInSeconds === "number" ? expiresInSeconds : 60 * 24 * 3600 * 60;
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

/** Trade the OAuth `code` for a long-lived token and look up the account it belongs to. */
export async function exchangeInstagramCode(
  app: InstagramApp,
  code: string,
  fetchImpl: Fetch = fetch,
  now: Date = new Date()
): Promise<InstagramTokenGrant> {
  const shortLived = await readJson(
    await fetchImpl(TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({
        client_id: app.appId,
        client_secret: app.appSecret,
        grant_type: "authorization_code",
        redirect_uri: app.redirectUri,
        code
      })
    })
  );
  // The endpoint answers either `{access_token, user_id}` or `{data: [{access_token, user_id}]}`.
  const first = Array.isArray(shortLived.data) ? (shortLived.data[0] as Record<string, unknown>) : shortLived;
  const shortToken = first?.access_token;
  if (typeof shortToken !== "string") throw new InstagramApiError("Instagram did not return an access token");

  const longUrl = new URL(`${GRAPH_URL}/access_token`);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", app.appSecret);
  longUrl.searchParams.set("access_token", shortToken);
  const long = await readJson(await fetchImpl(longUrl));
  const accessToken = long.access_token;
  if (typeof accessToken !== "string") throw new InstagramApiError("Instagram did not return a long-lived token");

  const profileUrl = new URL(`${GRAPH_URL}/${GRAPH_VERSION}/me`);
  profileUrl.searchParams.set("fields", "user_id,username");
  profileUrl.searchParams.set("access_token", accessToken);
  const profile = await readJson(await fetchImpl(profileUrl));
  const igUserId = String(profile.user_id ?? first.user_id ?? "");
  if (!igUserId) throw new InstagramApiError("Instagram did not return the account id");

  return {
    accessToken,
    igUserId,
    username: String(profile.username ?? ""),
    expiresAt: expiryFrom(long.expires_in, now)
  };
}

/** Extend a long-lived token by another ~60 days. Only works on tokens older than 24 hours. */
export async function refreshInstagramToken(
  accessToken: string,
  fetchImpl: Fetch = fetch,
  now: Date = new Date()
): Promise<{ accessToken: string; expiresAt: string }> {
  const url = new URL(`${GRAPH_URL}/refresh_access_token`);
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
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
};

async function graphPost(
  path: string,
  accessToken: string,
  params: Record<string, string>,
  fetchImpl: Fetch
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  return readJson(await fetchImpl(`${GRAPH_URL}/${GRAPH_VERSION}/${path}`, { method: "POST", body }));
}

async function graphGet(
  path: string,
  accessToken: string,
  fields: string,
  fetchImpl: Fetch
): Promise<Record<string, unknown>> {
  const url = new URL(`${GRAPH_URL}/${GRAPH_VERSION}/${path}`);
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
  sleep: (ms: number) => Promise<void>
): Promise<void> {
  for (let attempt = 0; attempt < CONTAINER_POLL_MAX_ATTEMPTS; attempt += 1) {
    const { status_code: status } = await graphGet(containerId, accessToken, "status_code", fetchImpl);
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
      fetchImpl
    );
    childIds.push(requireId(child, "a media container id"));
  }
  for (const childId of childIds) await waitForContainer(childId, accessToken, fetchImpl, sleep);

  const carousel = await graphPost(
    `${igUserId}/media`,
    accessToken,
    { media_type: "CAROUSEL", children: childIds.join(","), caption },
    fetchImpl
  );
  const carouselId = requireId(carousel, "a carousel container id");
  await waitForContainer(carouselId, accessToken, fetchImpl, sleep);

  const published = await graphPost(`${igUserId}/media_publish`, accessToken, { creation_id: carouselId }, fetchImpl);
  const mediaId = requireId(published, "the published media id");
  const { permalink } = await graphGet(mediaId, accessToken, "permalink", fetchImpl);
  return { mediaId, permalink: typeof permalink === "string" ? permalink : "" };
}
