import type {
  Account,
  AutoRunSettings,
  Guideline,
  GuidelineUpsert,
  Idea,
  ImageAsset,
  Job,
  MemoryItem,
  Post,
  PostAsset,
  Reference,
  ReferenceCreate
} from "@ama/shared";

const API_BASE_URL = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${response.status}): ${text}`);
  }
  return (await response.json()) as T;
}

export async function fetchHealth() {
  return request<{
    ok: boolean;
    mode: string;
    dataStore: string;
    integrations: Record<string, boolean>;
  }>("/health");
}

export async function ensureSeed() {
  return request<{ seeded: boolean; accountId: string; mode: string }>("/seed", {
    method: "POST"
  });
}

export async function listAccounts() {
  return request<{ items: Account[]; mode: string }>("/accounts");
}

export async function listPosts() {
  return request<{ items: Post[]; mode: string }>("/posts");
}

export async function listJobs() {
  return request<{ items: Job[]; mode: string }>("/jobs");
}

export async function getGuideline(accountId: string) {
  return request<{ item: Guideline; mode: string }>(`/accounts/${accountId}/guideline`);
}

export async function putGuideline(accountId: string, body: GuidelineUpsert) {
  return request<{ item: Guideline; mode: string }>(`/accounts/${accountId}/guideline`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

export async function listReferences(accountId: string) {
  return request<{ items: Reference[]; mode: string }>(`/accounts/${accountId}/references`);
}

export async function createReference(accountId: string, body: ReferenceCreate) {
  return request<{ item: Reference; mode: string }>(`/accounts/${accountId}/references`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function uploadReferenceFile(accountId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return request<{ item: Reference; truncated: boolean; mode: string }>(
    `/accounts/${accountId}/reference-files`,
    { method: "POST", body }
  );
}

export async function importInstagramReferences(accountId: string, referenceUrl: string, screenshots: string[]) {
  return request<{ items: Reference[]; mode: string }>(`/accounts/${accountId}/references/from-instagram`, {
    method: "POST",
    body: JSON.stringify({ referenceUrl, screenshots })
  });
}

export async function deleteReference(referenceId: string) {
  return request<{ ok: boolean }>(`/references/${referenceId}`, { method: "DELETE" });
}

export async function listMemory(accountId: string) {
  return request<{ items: MemoryItem[]; mode: string }>(`/accounts/${accountId}/memory`);
}

export async function deleteMemory(memoryId: string) {
  return request<{ ok: boolean }>(`/memory/${memoryId}`, { method: "DELETE" });
}

export async function listIdeas(accountId: string, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<{ items: Idea[]; mode: string }>(`/accounts/${accountId}/ideas${q}`);
}

export async function runIdeation(input: {
  accountId: string;
  count?: number;
  seedText?: string;
  seedUrl?: string;
}) {
  return request<{
    mode: string;
    summary: string;
    items: Idea[];
    reasoning: string[];
    agentRunId: string;
  }>("/ideation/run", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function patchIdea(
  ideaId: string,
  body: {
    status?: Idea["status"];
    rejectReason?: string;
  }
) {
  return request<{ item: Idea; mode: string }>(`/ideas/${ideaId}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

export async function approvePost(postId: string) {
  return request<{ item: Post }>(`/posts/${postId}/approve`, { method: "POST" });
}

export type BrandTemplate = { id: string; title: string; thumbnailUrl: string | null };

export async function listBrandTemplates() {
  return request<{ items: BrandTemplate[]; mode: string }>("/canva/brand-templates");
}

export type TemplateDraftInput = {
  referenceUrl: string;
  assetUrls: string[];
  styleNotes: string;
  /** Slides of one reference carousel, in order (image data URLs). */
  screenshots: string[];
};

export type TemplateDraft = {
  draft: { designId: string; editUrl: string };
  brief: { referenceHandle: string | null; markdown: string; pages: Array<{ page: number; title: string }> };
  mode: string;
};

/** Creates the multi-page Canva draft; the user tags and publishes it in Canva afterwards. */
export async function createTemplateDraft(body: TemplateDraftInput) {
  return request<TemplateDraft>("/canva/template-drafts", { method: "POST", body: JSON.stringify(body) });
}

export async function createAccountApi(body: {
  name: string;
  instagramHandle: string;
  tone: string;
  canvaTemplateId: string;
}) {
  return request<{ item: Account }>("/accounts", { method: "POST", body: JSON.stringify(body) });
}

export async function putCanvaTemplate(accountId: string, templateId: string) {
  return request<{ item: Account }>(`/accounts/${accountId}/canva-template`, {
    method: "PUT",
    body: JSON.stringify({ templateId })
  });
}

export async function putAutoRun(accountId: string, body: AutoRunSettings) {
  return request<{ item: Account }>(`/accounts/${accountId}/auto-run`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

export type PostDetail = { post: Post; assets: PostAsset[] };

export async function getPostDetail(postId: string) {
  return request<PostDetail>(`/posts/${postId}`);
}

/** Starts agent + Canva render in the background; poll getPostDetail until generationStatus is ready/failed. */
export async function createContent(ideaId: string) {
  return request<{ item: Post }>(`/ideas/${ideaId}/create`, { method: "POST" });
}

export async function regeneratePost(postId: string, feedback?: string) {
  return request<{ item: Post }>(`/posts/${postId}/regenerate`, {
    method: "POST",
    body: JSON.stringify({ feedback })
  });
}

/** `reexport` refreshes expired preview URLs without re-running Canva autofill. */
export async function renderPost(postId: string, reexport: boolean) {
  return request<PostDetail>(`/posts/${postId}/render`, {
    method: "POST",
    body: JSON.stringify({ reexport })
  });
}

export async function schedulePost(postId: string, scheduledAt: string) {
  return request<{ item: Post }>(`/posts/${postId}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduledAt })
  });
}

export type DashboardBundle = {
  health: Awaited<ReturnType<typeof fetchHealth>>;
  accounts: Account[];
  posts: Post[];
  guideline: Guideline | null;
  references: Reference[];
  memory: MemoryItem[];
  ideas: Idea[];
  dataStore: string;
};

export async function fetchWorkspaceBundle(accountId?: string): Promise<DashboardBundle> {
  await ensureSeed().catch(() => null);
  const health = await fetchHealth();
  const accountsRes = await listAccounts();
  const postsRes = await listPosts();
  const activeId = accountId ?? accountsRes.items[0]?.id;
  if (!activeId) {
    return {
      health,
      accounts: accountsRes.items,
      posts: postsRes.items,
      guideline: null,
      references: [],
      memory: [],
      ideas: [],
      dataStore: health.dataStore
    };
  }
  const [guidelineRes, referencesRes, memoryRes, ideasRes] = await Promise.all([
    getGuideline(activeId).catch(() => null),
    listReferences(activeId),
    listMemory(activeId),
    listIdeas(activeId)
  ]);
  return {
    health,
    accounts: accountsRes.items,
    posts: postsRes.items,
    guideline: guidelineRes?.item ?? null,
    references: referencesRes.items,
    memory: memoryRes.items,
    ideas: ideasRes.items,
    dataStore: health.dataStore
  };
}

export async function listImageAssets(accountId: string) {
  return request<{ items: ImageAsset[]; mode: string }>(`/accounts/${accountId}/image-assets`);
}

export async function uploadImageAsset(
  accountId: string,
  file: File,
  label: string,
  description: string,
  kind: "asset" | "reference"
) {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  body.append("label", label);
  body.append("description", description);
  return request<{ item: ImageAsset; mode: string }>(`/accounts/${accountId}/image-assets`, {
    method: "POST",
    body
  });
}

export async function deleteImageAsset(assetId: string) {
  return request<{ ok: boolean }>(`/image-assets/${assetId}`, { method: "DELETE" });
}

export const imageAssetFileUrl = (assetId: string) => `${API_BASE_URL}/image-assets/${assetId}/file`;

export async function listImageSlots(accountId: string) {
  return request<{ slots: string[] }>(`/accounts/${accountId}/image-slots`);
}

export async function getImageStyle(accountId: string) {
  return request<{ prompt: string }>(`/accounts/${accountId}/image-style`);
}

export async function saveImageStyle(accountId: string, prompt: string) {
  return request<{ prompt: string }>(`/accounts/${accountId}/image-style`, {
    method: "PUT",
    body: JSON.stringify({ prompt })
  });
}
