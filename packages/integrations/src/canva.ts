import { NotConfiguredError } from "./errors";

/**
 * Canva Connect client. Ported from marketing-automation-tools/tiktok_dashboard/canva_connect.py.
 *
 * Canva rotates the refresh_token on every exchange (the old one is revoked), so the
 * latest token is persisted through a CanvaTokenStore. `seedRefreshToken` only bootstraps
 * an empty store; after that the store is the source of truth.
 */

export const CANVA_BASE_URL = "https://api.canva.com/rest/v1";
export const DESIGN_PAGES_CACHE_TTL_MS = 60 * 60 * 1000;

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 40;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const DESIGN_ID_RE = /\/design\/([A-Za-z0-9_-]+)/;
const CANVA_SHORTLINK_HOSTS = new Set(["canva.link", "www.canva.link"]);

export interface CanvaTokenStore {
  load(): Promise<string | null>;
  save(refreshToken: string): Promise<void>;
}

export interface CanvaDesignCache {
  get(designId: string, maxAgeMs: number): Promise<string[] | null>;
  set(designId: string, urls: string[]): Promise<void>;
}

export type CanvaThumbnail = { url: string; width: number; height: number };

export interface CanvaClient {
  mode: "mock" | "canva";
  autofill(input: {
    templateId: string;
    fields: Readonly<Record<string, string>>;
    title?: string;
  }): Promise<{ designId: string }>;
  /** PNG URL for every page of the design, in page order. */
  exportPages(designId: string): Promise<string[]>;
  getThumbnail(designId: string): Promise<CanvaThumbnail | null>;
}

/** Autofill `data` payload: every field is a Canva text data field. */
export function toAutofillData(
  fields: Readonly<Record<string, string>>
): Record<string, { type: "text"; text: string }> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, text]) => [name, { type: "text" as const, text }])
  );
}

/** Pull the design id out of a Canva design URL; `canva.link` shortlinks are followed. */
export async function resolveCanvaDesignId(
  designUrlOrId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const direct = DESIGN_ID_RE.exec(designUrlOrId);
  if (direct) return direct[1] ?? null;
  if (!designUrlOrId.includes("/")) return designUrlOrId.trim() || null;

  let host: string;
  try {
    host = new URL(designUrlOrId).host.toLowerCase();
  } catch {
    return null;
  }
  if (!CANVA_SHORTLINK_HOSTS.has(host)) return null;
  const response = await fetchImpl(designUrlOrId, { redirect: "follow" });
  return DESIGN_ID_RE.exec(response.url)?.[1] ?? null;
}

export class MockCanvaClient implements CanvaClient {
  mode: "mock" = "mock";
  async autofill(input: { templateId: string }) {
    return { designId: `design_${input.templateId}` };
  }
  async exportPages(designId: string) {
    return Array.from(
      { length: 8 },
      (_, index) => `https://images.example.com/${designId}/page_${index + 1}.png`
    );
  }
  async getThumbnail(designId: string) {
    return { url: `https://images.example.com/${designId}/thumb.png`, width: 1080, height: 1350 };
  }
}

export type CanvaCredentials = {
  clientId?: string;
  clientSecret?: string;
  /** Only used while the token store is empty. */
  seedRefreshToken?: string;
  tokenStore?: CanvaTokenStore;
  designCache?: CanvaDesignCache;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

type CanvaJob = {
  job: {
    id: string;
    status: "in_progress" | "success" | "failed";
    result?: { design?: { id: string } };
    urls?: string[];
    error?: { message?: string };
  };
};

type TokenResponse = { access_token: string; expires_in?: number; refresh_token?: string };

export class CanvaApiClient implements CanvaClient {
  mode: "canva" = "canva";
  private accessToken?: { value: string; expiresAt: number };
  private refreshing?: Promise<string>;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly credentials: CanvaCredentials) {
    this.fetchImpl = credentials.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sleep = credentials.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async autofill(input: {
    templateId: string;
    fields: Readonly<Record<string, string>>;
    title?: string;
  }): Promise<{ designId: string }> {
    const created = await this.request<CanvaJob>("POST", "/autofills", {
      brand_template_id: input.templateId,
      ...(input.title ? { title: input.title } : {}),
      data: toAutofillData(input.fields)
    });
    const done = await this.poll(`/autofills/${created.job.id}`, created);
    const designId = done.job.result?.design?.id;
    if (!designId) {
      throw new Error("Canva autofill finished without a design id");
    }
    return { designId };
  }

  async exportPages(designId: string): Promise<string[]> {
    const { designCache } = this.credentials;
    const cached = await designCache?.get(designId, DESIGN_PAGES_CACHE_TTL_MS);
    if (cached && cached.length > 0) return cached;

    const created = await this.request<CanvaJob>("POST", "/exports", {
      design_id: designId,
      format: { type: "png" }
    });
    const done = await this.poll(`/exports/${created.job.id}`, created);
    const urls = done.job.urls ?? [];
    if (urls.length === 0) {
      throw new Error("Canva export finished without download urls");
    }
    try {
      await designCache?.set(designId, urls);
    } catch (error) {
      // The export itself succeeded; a cache write failure only costs a re-export later.
      console.warn(`Canva design cache write failed for ${designId}`, error);
    }
    return urls;
  }

  async getThumbnail(designId: string): Promise<CanvaThumbnail | null> {
    const response = await this.request<{
      design?: { thumbnail?: { url?: string; width?: number; height?: number } };
    }>("GET", `/designs/${designId}`);
    const thumbnail = response.design?.thumbnail;
    if (!thumbnail?.url) return null;
    return { url: thumbnail.url, width: thumbnail.width ?? 0, height: thumbnail.height ?? 0 };
  }

  private async poll(path: string, initial: CanvaJob): Promise<CanvaJob> {
    let current = initial;
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      if (current.job.status === "success") return current;
      if (current.job.status === "failed") {
        throw new Error(`Canva job failed: ${current.job.error?.message ?? "unknown error"}`);
      }
      await this.sleep(POLL_INTERVAL_MS);
      current = await this.request<CanvaJob>("GET", path);
    }
    throw new Error("Canva job timed out");
  }

  private getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt - Date.now() > TOKEN_EXPIRY_MARGIN_MS) {
      return Promise.resolve(this.accessToken.value);
    }
    // One refresh at a time: a second concurrent exchange would use an already-revoked token.
    this.refreshing ??= this.refreshAccessToken().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async refreshAccessToken(): Promise<string> {
    const { clientId, clientSecret, tokenStore, seedRefreshToken } = this.credentials;
    if (!clientId || !clientSecret || !tokenStore) {
      throw new NotConfiguredError("Canva API");
    }
    const refreshToken = (await tokenStore.load()) ?? seedRefreshToken;
    if (!refreshToken) {
      throw new NotConfiguredError("Canva refresh token (run the OAuth bootstrap script)");
    }

    const response = await this.fetchImpl(`${CANVA_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken })
    });
    if (!response.ok) {
      throw new Error(`Canva token refresh failed (${response.status}): ${await response.text()}`);
    }
    const data = (await response.json()) as TokenResponse;

    // Canva revoked the old refresh token the moment this response was produced; if we cannot
    // persist the new one we are locked out, so fail loudly instead of continuing.
    if (data.refresh_token) {
      try {
        await tokenStore.save(data.refresh_token);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Got a Canva access token but failed to persist the rotated refresh token: ${reason}`);
      }
    }
    this.accessToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000
    };
    return data.access_token;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(`${CANVA_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      throw new Error(`Canva ${method} ${path} failed (${response.status}): ${await response.text()}`);
    }
    return (await response.json()) as T;
  }
}

export type CanvaClientOptions = {
  canvaClientId?: string;
  canvaClientSecret?: string;
  canvaRefreshToken?: string;
  canvaTokenStore?: CanvaTokenStore;
  canvaDesignCache?: CanvaDesignCache;
};

/** Live client only when credentials AND a token store exist; otherwise the mock. */
export function createCanvaClient(options: CanvaClientOptions): CanvaClient {
  if (options.canvaClientId && options.canvaClientSecret && options.canvaTokenStore) {
    return new CanvaApiClient({
      clientId: options.canvaClientId,
      clientSecret: options.canvaClientSecret,
      seedRefreshToken: options.canvaRefreshToken,
      tokenStore: options.canvaTokenStore,
      designCache: options.canvaDesignCache
    });
  }
  return new MockCanvaClient();
}
