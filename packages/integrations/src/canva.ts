import { slideFieldsSchema } from "@ama/shared";
import { buildDraftPdf } from "./draft-pdf";
import { NotConfiguredError } from "./errors";
import type { TemplateStructure } from "./template-structure";

/**
 * Canva Connect client. Ported from marketing-automation-tools/tiktok_dashboard/canva_connect.py.
 *
 * Canva rotates the refresh_token on every exchange (the old one is revoked), so the
 * latest token is persisted through a CanvaTokenStore. `seedRefreshToken` only bootstraps
 * an empty store; after that the store is the source of truth.
 */

export const CANVA_BASE_URL = "https://api.canva.com/rest/v1";
export const DESIGN_PAGES_CACHE_TTL_MS = 60 * 60 * 1000;

const MAX_TEMPLATE_PAGES = 5;
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

export type CanvaBrandTemplate = { id: string; title: string; thumbnailUrl: string | null };

/** Autofill field names a brand template must expose (s1_title … s8_cta). */
export const REQUIRED_TEMPLATE_FIELDS: readonly string[] = Object.keys(slideFieldsSchema.shape);

export function missingTemplateFields(available: readonly string[]): string[] {
  const have = new Set(available);
  return REQUIRED_TEMPLATE_FIELDS.filter((name) => !have.has(name));
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
  listBrandTemplates(): Promise<CanvaBrandTemplate[]>;
  /** Names of the autofill data fields defined on a brand template. */
  getTemplateFieldNames(templateId: string): Promise<string[]>;
  /**
   * 4:5 design a human finishes in Canva (lay it out, tag the autofill fields, publish as a brand
   * template). With a `structure` it has one page per structure page (imported from a generated
   * PDF); without one it is a single blank page. The Connect API cannot add elements or publish
   * templates, so this is the furthest the app can go on its own.
   */
  createDraftDesign(input: { title: string; structure?: TemplateStructure }): Promise<CanvaDraftDesign>;
}

export type CanvaDraftDesign = { designId: string; editUrl: string };

export const TEMPLATE_PAGE_WIDTH = 1080;
export const TEMPLATE_PAGE_HEIGHT = 1350;

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
  async listBrandTemplates() {
    return [{ id: "tpl_wakaru_explainer_v1", title: "wakaru-explainer hybrid v1 (mock)", thumbnailUrl: null }];
  }
  async getTemplateFieldNames() {
    return [...REQUIRED_TEMPLATE_FIELDS];
  }
  async createDraftDesign(input: { title: string; structure?: TemplateStructure }) {
    const designId = `draft_${input.title.replace(/\W+/g, "_")}`;
    return { designId, editUrl: `https://www.canva.com/design/${designId}/edit` };
  }
}

/**
 * Access token and in-flight refresh. Canva refresh tokens are single use, so every client built
 * in the same process must share one of these; separate clients would each exchange the same
 * stored token and Canva would revoke the whole lineage.
 */
export type CanvaSharedState = {
  accessToken?: { value: string; expiresAt: number };
  refreshing?: Promise<string>;
};

export type CanvaCredentials = {
  clientId?: string;
  clientSecret?: string;
  /** Only used while the token store is empty. */
  seedRefreshToken?: string;
  tokenStore?: CanvaTokenStore;
  designCache?: CanvaDesignCache;
  /** Defaults to private state; pass the same object to every client in a process. */
  shared?: CanvaSharedState;
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

type CanvaImportJob = {
  job: {
    id: string;
    status: "in_progress" | "success" | "failed";
    result?: { designs?: Array<{ id: string; urls?: { edit_url?: string } }> };
    error?: { message?: string };
  };
};

function toBase64(text: string): string {
  return btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));
}

type TokenResponse = { access_token: string; expires_in?: number; refresh_token?: string };

export class CanvaApiClient implements CanvaClient {
  mode: "canva" = "canva";
  private readonly state: CanvaSharedState;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly credentials: CanvaCredentials) {
    this.state = credentials.shared ?? {};
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

  async listBrandTemplates(): Promise<CanvaBrandTemplate[]> {
    type Page = {
      items?: Array<{ id: string; title?: string; thumbnail?: { url?: string } }>;
      continuation?: string;
    };
    const templates: CanvaBrandTemplate[] = [];
    let continuation: string | undefined;
    for (let page = 0; page < MAX_TEMPLATE_PAGES; page++) {
      const query = new URLSearchParams({ limit: "50", ...(continuation ? { continuation } : {}) });
      const response = await this.request<Page>("GET", `/brand-templates?${query}`);
      for (const item of response.items ?? []) {
        templates.push({ id: item.id, title: item.title ?? item.id, thumbnailUrl: item.thumbnail?.url ?? null });
      }
      continuation = response.continuation;
      if (!continuation) break;
    }
    return templates;
  }

  async getTemplateFieldNames(templateId: string): Promise<string[]> {
    const response = await this.request<{ dataset?: Record<string, unknown> }>(
      "GET",
      `/brand-templates/${encodeURIComponent(templateId)}/dataset`
    );
    return Object.keys(response.dataset ?? {});
  }

  async createDraftDesign(input: { title: string; structure?: TemplateStructure }): Promise<CanvaDraftDesign> {
    if (input.structure) return this.importDraftPdf(input.title, input.structure);
    const response = await this.request<{
      design?: { id?: string; urls?: { edit_url?: string } };
    }>("POST", "/designs", {
      design_type: { type: "custom", width: TEMPLATE_PAGE_WIDTH, height: TEMPLATE_PAGE_HEIGHT },
      title: input.title
    });
    const designId = response.design?.id;
    if (!designId) {
      throw new Error("Canva created the draft without a design id");
    }
    return {
      designId,
      editUrl: response.design?.urls?.edit_url ?? `https://www.canva.com/design/${designId}/edit`
    };
  }

  private async importDraftPdf(title: string, structure: TemplateStructure): Promise<CanvaDraftDesign> {
    const created = await this.request<CanvaImportJob>("POST", "/imports", await buildDraftPdf(structure), {
      "Content-Type": "application/octet-stream",
      "Import-Metadata": JSON.stringify({ title_base64: toBase64(title), mime_type: "application/pdf" })
    });
    const done = await this.poll(`/imports/${created.job.id}`, created);
    const design = done.job.result?.designs?.[0];
    if (!design?.id) {
      throw new Error("Canva import finished without a design id");
    }
    return {
      designId: design.id,
      editUrl: design.urls?.edit_url ?? `https://www.canva.com/design/${design.id}/edit`
    };
  }

  private async poll<T extends Pick<CanvaJob, "job"> | CanvaImportJob>(path: string, initial: T): Promise<T> {
    let current = initial;
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      if (current.job.status === "success") return current;
      if (current.job.status === "failed") {
        throw new Error(`Canva job failed: ${current.job.error?.message ?? "unknown error"}`);
      }
      await this.sleep(POLL_INTERVAL_MS);
      current = await this.request<T>("GET", path);
    }
    throw new Error("Canva job timed out");
  }

  private getAccessToken(): Promise<string> {
    const { accessToken } = this.state;
    if (accessToken && accessToken.expiresAt - Date.now() > TOKEN_EXPIRY_MARGIN_MS) {
      return Promise.resolve(accessToken.value);
    }
    // One refresh at a time: a second concurrent exchange would use an already-revoked token.
    this.state.refreshing ??= this.refreshAccessToken().finally(() => {
      this.state.refreshing = undefined;
    });
    return this.state.refreshing;
  }

  private async refreshAccessToken(): Promise<string> {
    const { clientId, clientSecret, tokenStore, seedRefreshToken } = this.credentials;
    if (!clientId || !clientSecret || !tokenStore) {
      throw new NotConfiguredError("Canva API");
    }
    let refreshToken = (await tokenStore.load()) ?? seedRefreshToken;
    if (!refreshToken) {
      throw new NotConfiguredError("Canva refresh token (run the OAuth bootstrap script)");
    }

    let response = await this.exchangeRefreshToken(clientId, clientSecret, refreshToken);
    if (response.status === 400) {
      // Another process (e.g. a second worker isolate) may have spent this token and stored its
      // successor. Use that once; if the stored token is unchanged the lineage really is dead.
      const latest = await tokenStore.load();
      if (latest && latest !== refreshToken) {
        refreshToken = latest;
        response = await this.exchangeRefreshToken(clientId, clientSecret, refreshToken);
      }
    }
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
    this.state.accessToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000
    };
    return data.access_token;
  }

  private exchangeRefreshToken(clientId: string, clientSecret: string, refreshToken: string): Promise<Response> {
    return this.fetchImpl(`${CANVA_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken })
    });
  }

  /** JSON body by default; pass `headers` with a `Uint8Array` body for binary uploads (imports). */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>
  ): Promise<T> {
    const token = await this.getAccessToken();
    const binary = body instanceof Uint8Array;
    const response = await this.fetchImpl(`${CANVA_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body && !binary ? { "Content-Type": "application/json" } : {}),
        ...headers
      },
      body: body ? (binary ? new Uint8Array(body) : JSON.stringify(body)) : undefined
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

/** One per client id for the life of the process, so per-request clients never refresh in parallel. */
const sharedStateByClientId = new Map<string, CanvaSharedState>();

function sharedStateFor(clientId: string): CanvaSharedState {
  const existing = sharedStateByClientId.get(clientId);
  if (existing) return existing;
  const created: CanvaSharedState = {};
  sharedStateByClientId.set(clientId, created);
  return created;
}

/** Live client only when credentials AND a token store exist; otherwise the mock. */
export function createCanvaClient(options: CanvaClientOptions): CanvaClient {
  if (options.canvaClientId && options.canvaClientSecret && options.canvaTokenStore) {
    return new CanvaApiClient({
      shared: sharedStateFor(options.canvaClientId),
      clientId: options.canvaClientId,
      clientSecret: options.canvaClientSecret,
      seedRefreshToken: options.canvaRefreshToken,
      tokenStore: options.canvaTokenStore,
      designCache: options.canvaDesignCache
    });
  }
  return new MockCanvaClient();
}
