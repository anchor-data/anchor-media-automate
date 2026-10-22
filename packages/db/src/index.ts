import { createClient, type Client } from "@libsql/client";
import type {
  Account,
  AgentRun,
  Guideline,
  GuidelineUpsert,
  Idea,
  IdeaStatus,
  Job,
  MemoryItem,
  MemoryKind,
  Post,
  PostAsset,
  PostStatus,
  Reference,
  ReferenceCreate,
  ReferenceKind
} from "@ama/shared";
import { createPhase1Seed } from "./seed";

export type DraftInput = {
  accountId: string;
  title: string;
  caption: string;
  assets: Array<{ imageUrl: string; canvaDesignId?: string; slideIndex?: number; templateId?: string }>;
  ideaId?: string;
  postType?: Post["postType"];
  slidesJson?: unknown;
  hashtags?: string[];
  generationStatus?: Post["generationStatus"];
};

export interface Repository {
  mode: "mock" | "turso";
  listJobs(): Promise<Job[]>;
  listPosts(): Promise<Post[]>;
  getPost(postId: string): Promise<{ post: Post; assets: PostAsset[] } | null>;
  listPostsByAccount(accountId: string, limit: number): Promise<Post[]>;
  getAccount(accountId: string): Promise<Account | null>;
  listAccounts(): Promise<Account[]>;
  createAccount(account: Account): Promise<Account>;
  updateAccountTemplate(accountId: string, canvaTemplateId: string): Promise<Account | null>;
  createPostDraft(input: DraftInput): Promise<{ post: Post; assets: PostAsset[] }>;
  updatePost(
    postId: string,
    fields: {
      title?: string;
      caption?: string;
      status?: PostStatus;
      scheduledAt?: string | null;
      generationStatus?: Post["generationStatus"];
      generationError?: string | null;
      rejectReason?: string | null;
      slidesJson?: unknown;
      hashtags?: string[];
      postType?: Post["postType"];
    }
  ): Promise<Post | null>;
  setPostStatus(postId: string, status: PostStatus): Promise<Post | null>;
  createAgentRun(run: AgentRun): Promise<void>;
  /** Swap all slide assets of a post for a fresh render. */
  replacePostAssets(postId: string, assets: DraftInput["assets"]): Promise<PostAsset[]>;

  getCanvaRefreshToken(): Promise<string | null>;
  saveCanvaRefreshToken(token: string): Promise<void>;
  getCachedDesignPages(designId: string, maxAgeMs: number): Promise<string[] | null>;
  saveCachedDesignPages(designId: string, urls: string[]): Promise<void>;

  getActiveGuideline(accountId: string): Promise<Guideline | null>;
  upsertGuideline(accountId: string, input: GuidelineUpsert): Promise<Guideline>;

  listReferences(accountId: string, kind?: ReferenceKind): Promise<Reference[]>;
  createReference(accountId: string, input: ReferenceCreate): Promise<Reference>;
  updateReference(
    referenceId: string,
    fields: Partial<ReferenceCreate> & { active?: boolean }
  ): Promise<Reference | null>;
  deleteReference(referenceId: string): Promise<boolean>;

  listMemory(accountId: string, kinds?: MemoryKind[]): Promise<MemoryItem[]>;
  createMemoryItem(
    item: Omit<MemoryItem, "id" | "createdAt"> & { id?: string }
  ): Promise<MemoryItem>;
  deleteMemoryItem(memoryId: string): Promise<boolean>;

  getIdea(ideaId: string): Promise<Idea | null>;
  listIdeas(accountId: string, status?: IdeaStatus): Promise<Idea[]>;
  createIdeas(ideas: Omit<Idea, "id" | "createdAt" | "updatedAt">[]): Promise<Idea[]>;
  updateIdea(
    ideaId: string,
    fields: Partial<Pick<Idea, "status" | "jobId" | "score" | "rationale">>
  ): Promise<Idea | null>;

  /** Insert Phase-1 seed if account acc_001 is missing. */
  ensurePhase1Seed(): Promise<{ seeded: boolean; accountId: string }>;
}

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonUnknown(value: unknown): unknown {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

class MockRepository implements Repository {
  mode: "mock" = "mock";
  private seed = createPhase1Seed();
  private accounts = [this.seed.account];
  private jobs = this.seed.jobs;
  private posts = this.seed.posts;
  private assets = this.seed.assets;
  private agentRuns: AgentRun[] = [];
  private guidelines = [this.seed.guideline];
  private references = [...this.seed.references];
  private memory = [...this.seed.memory];
  private ideas = [...this.seed.ideas];

  async listJobs() {
    return this.jobs;
  }
  async listPosts() {
    return this.posts;
  }
  async getPost(postId: string) {
    const post = this.posts.find((p) => p.id === postId);
    if (!post) return null;
    return { post, assets: this.assets.filter((a) => a.postId === postId) };
  }
  async listPostsByAccount(accountId: string, limit: number) {
    return this.posts.filter((p) => p.accountId === accountId).slice(0, limit);
  }
  async getAccount(accountId: string) {
    return this.accounts.find((a) => a.id === accountId) ?? null;
  }
  async listAccounts() {
    return this.accounts;
  }
  async updateAccountTemplate(accountId: string, canvaTemplateId: string) {
    const index = this.accounts.findIndex((a) => a.id === accountId);
    if (index < 0) return null;
    const updated = { ...this.accounts[index]!, canvaTemplateId };
    this.accounts = this.accounts.map((a, i) => (i === index ? updated : a));
    return updated;
  }
  async createAccount(account: Account) {
    if (this.accounts.some((a) => a.id === account.id)) {
      return account;
    }
    this.accounts.push(account);
    return account;
  }
  async createPostDraft(input: DraftInput) {
    const post: Post = {
      id: id("post"),
      accountId: input.accountId,
      title: input.title,
      caption: input.caption,
      status: "draft",
      ideaId: input.ideaId,
      postType: input.postType,
      slidesJson: input.slidesJson,
      hashtags: input.hashtags ?? [],
      generationStatus: input.generationStatus ?? "ready",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const assets = input.assets.map((asset, index) => ({
      id: id("asset"),
      postId: post.id,
      imageUrl: asset.imageUrl,
      canvaDesignId: asset.canvaDesignId,
      slideIndex: asset.slideIndex ?? index,
      templateId: asset.templateId
    }));
    this.posts.unshift(post);
    this.assets.push(...assets);
    return { post, assets };
  }
  async setPostStatus(postId: string, status: PostStatus) {
    return this.updatePost(postId, { status });
  }
  async updatePost(
    postId: string,
    fields: {
      title?: string;
      caption?: string;
      status?: PostStatus;
      scheduledAt?: string | null;
      generationStatus?: Post["generationStatus"];
      generationError?: string | null;
      rejectReason?: string | null;
      slidesJson?: unknown;
      hashtags?: string[];
      postType?: Post["postType"];
    }
  ) {
    const post = this.posts.find((p) => p.id === postId);
    if (!post) return null;
    if (fields.title !== undefined) post.title = fields.title;
    if (fields.caption !== undefined) post.caption = fields.caption;
    if (fields.status !== undefined) post.status = fields.status;
    if (fields.scheduledAt !== undefined) post.scheduledAt = fields.scheduledAt;
    if (fields.generationStatus !== undefined) post.generationStatus = fields.generationStatus;
    if (fields.generationError !== undefined) post.generationError = fields.generationError;
    if (fields.rejectReason !== undefined) post.rejectReason = fields.rejectReason;
    if (fields.slidesJson !== undefined) post.slidesJson = fields.slidesJson;
    if (fields.hashtags !== undefined) post.hashtags = fields.hashtags;
    if (fields.postType !== undefined) post.postType = fields.postType;
    post.updatedAt = nowIso();
    return post;
  }
  async createAgentRun(run: AgentRun) {
    this.agentRuns.push(run);
  }
  async replacePostAssets(postId: string, assets: DraftInput["assets"]) {
    const next = assets.map((asset, index) => ({
      id: id("asset"),
      postId,
      imageUrl: asset.imageUrl,
      canvaDesignId: asset.canvaDesignId,
      slideIndex: asset.slideIndex ?? index,
      templateId: asset.templateId
    }));
    this.assets = [...this.assets.filter((a) => a.postId !== postId), ...next];
    return next;
  }

  private canvaRefreshToken: string | null = null;
  private designCache = new Map<string, { urls: string[]; savedAt: number }>();
  async getCanvaRefreshToken() {
    return this.canvaRefreshToken;
  }
  async saveCanvaRefreshToken(token: string) {
    this.canvaRefreshToken = token;
  }
  async getCachedDesignPages(designId: string, maxAgeMs: number) {
    const hit = this.designCache.get(designId);
    return hit && Date.now() - hit.savedAt <= maxAgeMs ? hit.urls : null;
  }
  async saveCachedDesignPages(designId: string, urls: string[]) {
    this.designCache.set(designId, { urls, savedAt: Date.now() });
  }

  async getActiveGuideline(accountId: string) {
    return (
      this.guidelines
        .filter((g) => g.accountId === accountId && g.active)
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async upsertGuideline(accountId: string, input: GuidelineUpsert) {
    const current = await this.getActiveGuideline(accountId);
    if (current) current.active = false;
    const next: Guideline = {
      id: id("guide"),
      accountId,
      ...input,
      version: (current?.version ?? 0) + 1,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.guidelines.push(next);
    return next;
  }

  async listReferences(accountId: string, kind?: ReferenceKind) {
    return this.references.filter(
      (r) => r.accountId === accountId && r.active && (kind ? r.kind === kind : true)
    );
  }

  async createReference(accountId: string, input: ReferenceCreate) {
    const row: Reference = {
      id: id("ref"),
      accountId,
      kind: input.kind,
      title: input.title,
      sourceNote: input.sourceNote ?? "",
      structureJson: input.structureJson ?? null,
      examplesText: input.examplesText ?? "",
      active: input.active ?? true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.references.push(row);
    return row;
  }

  async updateReference(
    referenceId: string,
    fields: Partial<ReferenceCreate> & { active?: boolean }
  ) {
    const row = this.references.find((r) => r.id === referenceId);
    if (!row) return null;
    if (fields.kind !== undefined) row.kind = fields.kind;
    if (fields.title !== undefined) row.title = fields.title;
    if (fields.sourceNote !== undefined) row.sourceNote = fields.sourceNote;
    if (fields.structureJson !== undefined) row.structureJson = fields.structureJson;
    if (fields.examplesText !== undefined) row.examplesText = fields.examplesText;
    if (fields.active !== undefined) row.active = fields.active;
    row.updatedAt = nowIso();
    return row;
  }

  async deleteReference(referenceId: string) {
    const before = this.references.length;
    this.references = this.references.filter((r) => r.id !== referenceId);
    return this.references.length < before;
  }

  async listMemory(accountId: string, kinds?: MemoryKind[]) {
    return this.memory.filter(
      (m) => m.accountId === accountId && (kinds ? kinds.includes(m.kind) : true)
    );
  }

  async createMemoryItem(item: Omit<MemoryItem, "id" | "createdAt"> & { id?: string }) {
    const row: MemoryItem = {
      id: item.id ?? id("mem"),
      accountId: item.accountId,
      kind: item.kind,
      topicKey: item.topicKey,
      content: item.content,
      sourcePostId: item.sourcePostId,
      sourceIdeaId: item.sourceIdeaId,
      createdAt: nowIso()
    };
    this.memory.push(row);
    return row;
  }

  async deleteMemoryItem(memoryId: string) {
    const before = this.memory.length;
    this.memory = this.memory.filter((m) => m.id !== memoryId);
    return this.memory.length < before;
  }

  async getIdea(ideaId: string) {
    return this.ideas.find((i) => i.id === ideaId) ?? null;
  }

  async listIdeas(accountId: string, status?: IdeaStatus) {
    return this.ideas.filter(
      (idea) => idea.accountId === accountId && (status ? idea.status === status : true)
    );
  }

  async createIdeas(ideas: Omit<Idea, "id" | "createdAt" | "updatedAt">[]) {
    const t = nowIso();
    const created = ideas.map((idea) => ({
      ...idea,
      id: id("idea"),
      createdAt: t,
      updatedAt: t
    }));
    this.ideas.unshift(...created);
    return created;
  }

  async updateIdea(
    ideaId: string,
    fields: Partial<Pick<Idea, "status" | "jobId" | "score" | "rationale">>
  ) {
    const idea = this.ideas.find((i) => i.id === ideaId);
    if (!idea) return null;
    if (fields.status !== undefined) idea.status = fields.status;
    if (fields.jobId !== undefined) idea.jobId = fields.jobId;
    if (fields.score !== undefined) idea.score = fields.score;
    if (fields.rationale !== undefined) idea.rationale = fields.rationale;
    idea.updatedAt = nowIso();
    return idea;
  }

  async ensurePhase1Seed() {
    if (this.accounts.some((a) => a.id === "acc_001")) {
      return { seeded: false, accountId: "acc_001" };
    }
    const seed = createPhase1Seed();
    this.accounts = [seed.account];
    this.guidelines = [seed.guideline];
    this.references = [...seed.references];
    this.memory = [...seed.memory];
    this.ideas = [...seed.ideas];
    this.jobs = seed.jobs;
    this.posts = seed.posts;
    this.assets = seed.assets;
    return { seeded: true, accountId: seed.account.id };
  }
}

class TursoRepository implements Repository {
  mode: "turso" = "turso";
  constructor(private client: Client) {}

  async listJobs() {
    const result = await this.client.execute(
      "SELECT id, company, role, location, url FROM jobs ORDER BY created_at DESC"
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      company: String(row.company),
      role: String(row.role),
      location: String(row.location),
      url: String(row.url)
    }));
  }

  async listPosts() {
    const result = await this.client.execute(
      `SELECT id, account_id, idea_id, post_type, title, caption, slides_json, hashtags_json,
              status, generation_status, generation_error, reject_reason, scheduled_at,
              created_at, updated_at
       FROM posts ORDER BY created_at DESC`
    );
    return result.rows.map(mapPostRow);
  }

  async getPost(postId: string) {
    const postResult = await this.client.execute({
      sql: `SELECT id, account_id, idea_id, post_type, title, caption, slides_json, hashtags_json,
                   status, generation_status, generation_error, reject_reason, scheduled_at,
                   created_at, updated_at
            FROM posts WHERE id = ?`,
      args: [postId]
    });
    const first = postResult.rows[0];
    if (!first) return null;

    const assetsResult = await this.client.execute({
      sql: `SELECT id, post_id, image_url, canva_design_id, slide_index, template_id
            FROM post_assets WHERE post_id = ? ORDER BY slide_index ASC`,
      args: [postId]
    });
    return {
      post: mapPostRow(first),
      assets: assetsResult.rows.map(mapAssetRow)
    };
  }

  async listPostsByAccount(accountId: string, limit: number) {
    const result = await this.client.execute({
      sql: `SELECT id, account_id, idea_id, post_type, title, caption, slides_json, hashtags_json,
                   status, generation_status, generation_error, reject_reason, scheduled_at,
                   created_at, updated_at
            FROM posts WHERE account_id = ? ORDER BY created_at DESC LIMIT ?`,
      args: [accountId, limit]
    });
    return result.rows.map(mapPostRow);
  }

  async getAccount(accountId: string) {
    const result = await this.client.execute({
      sql: "SELECT id, name, instagram_handle, canva_template_id, tone FROM accounts WHERE id = ?",
      args: [accountId]
    });
    const row = result.rows[0];
    if (!row) return null;
    return mapAccountRow(row);
  }

  async listAccounts() {
    const result = await this.client.execute(
      "SELECT id, name, instagram_handle, canva_template_id, tone FROM accounts ORDER BY created_at DESC"
    );
    return result.rows.map(mapAccountRow);
  }

  async updateAccountTemplate(accountId: string, canvaTemplateId: string) {
    await this.client.execute({
      sql: "UPDATE accounts SET canva_template_id = ?, updated_at = ? WHERE id = ?",
      args: [canvaTemplateId, nowIso(), accountId]
    });
    return this.getAccount(accountId);
  }

  async createAccount(account: Account) {
    const existing = await this.getAccount(account.id);
    if (existing) return existing;
    const t = nowIso();
    await this.client.execute({
      sql: `INSERT INTO accounts (id, name, instagram_handle, canva_template_id, tone, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        account.id,
        account.name,
        account.instagramHandle,
        account.canvaTemplateId,
        account.tone,
        t,
        t
      ]
    });
    return account;
  }

  async createPostDraft(input: DraftInput) {
    const postId = id("post");
    const t = nowIso();
    await this.client.batch(
      [
        {
          sql: `INSERT INTO posts (
                  id, account_id, idea_id, post_type, title, caption, slides_json, hashtags_json,
                  status, generation_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            postId,
            input.accountId,
            input.ideaId ?? null,
            input.postType ?? null,
            input.title,
            input.caption,
            input.slidesJson != null ? JSON.stringify(input.slidesJson) : null,
            JSON.stringify(input.hashtags ?? []),
            "draft",
            input.generationStatus ?? "ready",
            t,
            t
          ]
        },
        ...input.assets.map((asset, index) => ({
          sql: `INSERT INTO post_assets (id, post_id, image_url, canva_design_id, slide_index, template_id)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            id("asset"),
            postId,
            asset.imageUrl,
            asset.canvaDesignId ?? null,
            asset.slideIndex ?? index,
            asset.templateId ?? null
          ]
        }))
      ],
      "write"
    );
    const post = await this.getPost(postId);
    if (!post) {
      throw new Error(`Unable to read post after insert: ${postId}`);
    }
    return post;
  }

  async updatePost(
    postId: string,
    fields: {
      title?: string;
      caption?: string;
      status?: PostStatus;
      scheduledAt?: string | null;
      generationStatus?: Post["generationStatus"];
      generationError?: string | null;
      rejectReason?: string | null;
      slidesJson?: unknown;
      hashtags?: string[];
      postType?: Post["postType"];
    }
  ) {
    const current = await this.getPost(postId);
    if (!current) return null;
    const p = current.post;
    await this.client.execute({
      sql: `UPDATE posts SET
              title = ?, caption = ?, status = ?, scheduled_at = ?,
              generation_status = ?, generation_error = ?, reject_reason = ?,
              slides_json = ?, hashtags_json = ?, post_type = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        fields.title ?? p.title,
        fields.caption ?? p.caption,
        fields.status ?? p.status,
        fields.scheduledAt !== undefined ? fields.scheduledAt : (p.scheduledAt ?? null),
        fields.generationStatus ?? p.generationStatus ?? "ready",
        fields.generationError !== undefined ? fields.generationError : (p.generationError ?? null),
        fields.rejectReason !== undefined ? fields.rejectReason : (p.rejectReason ?? null),
        fields.slidesJson !== undefined
          ? JSON.stringify(fields.slidesJson)
          : p.slidesJson != null
            ? JSON.stringify(p.slidesJson)
            : null,
        JSON.stringify(fields.hashtags ?? p.hashtags ?? []),
        fields.postType ?? p.postType ?? null,
        nowIso(),
        postId
      ]
    });
    const updated = await this.getPost(postId);
    return updated?.post ?? null;
  }

  async setPostStatus(postId: string, status: PostStatus) {
    return this.updatePost(postId, { status });
  }

  async replacePostAssets(postId: string, assets: DraftInput["assets"]) {
    await this.client.batch(
      [
        { sql: "DELETE FROM post_assets WHERE post_id = ?", args: [postId] },
        ...assets.map((asset, index) => ({
          sql: `INSERT INTO post_assets (id, post_id, image_url, canva_design_id, slide_index, template_id)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            id("asset"),
            postId,
            asset.imageUrl,
            asset.canvaDesignId ?? null,
            asset.slideIndex ?? index,
            asset.templateId ?? null
          ]
        }))
      ],
      "write"
    );
    return (await this.getPost(postId))?.assets ?? [];
  }

  async getCanvaRefreshToken() {
    const result = await this.client.execute("SELECT refresh_token FROM canva_tokens WHERE id = 1");
    const row = result.rows[0];
    return row ? String(row.refresh_token) : null;
  }

  async saveCanvaRefreshToken(token: string) {
    await this.client.execute({
      sql: `INSERT INTO canva_tokens (id, refresh_token, updated_at) VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET refresh_token = excluded.refresh_token, updated_at = excluded.updated_at`,
      args: [token, nowIso()]
    });
  }

  async getCachedDesignPages(designId: string, maxAgeMs: number) {
    const result = await this.client.execute({
      sql: "SELECT page_urls_json, updated_at FROM canva_design_cache WHERE design_id = ?",
      args: [designId]
    });
    const row = result.rows[0];
    if (!row) return null;
    if (Date.now() - Date.parse(String(row.updated_at)) > maxAgeMs) return null;
    const urls = parseJsonArray(row.page_urls_json);
    return urls.length > 0 ? urls : null;
  }

  async saveCachedDesignPages(designId: string, urls: string[]) {
    await this.client.execute({
      sql: `INSERT INTO canva_design_cache (design_id, page_urls_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(design_id) DO UPDATE SET
              page_urls_json = excluded.page_urls_json, updated_at = excluded.updated_at`,
      args: [designId, JSON.stringify(urls), nowIso()]
    });
  }

  async createAgentRun(run: AgentRun) {
    await this.client.execute({
      sql: `INSERT INTO agent_runs (id, account_id, created_post_id, kind, summary, output_json)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        run.id,
        run.accountId,
        run.createdPostId ?? null,
        run.kind ?? "creation",
        run.summary,
        JSON.stringify(run.outputJson)
      ]
    });
  }

  async getActiveGuideline(accountId: string) {
    const result = await this.client.execute({
      sql: `SELECT * FROM guidelines
            WHERE account_id = ? AND active = 1
            ORDER BY version DESC LIMIT 1`,
      args: [accountId]
    });
    const row = result.rows[0];
    return row ? mapGuidelineRow(row) : null;
  }

  async upsertGuideline(accountId: string, input: GuidelineUpsert) {
    const current = await this.getActiveGuideline(accountId);
    const t = nowIso();
    const nextId = id("guide");
    const version = (current?.version ?? 0) + 1;
    const statements = [
      ...(current
        ? [
            {
              sql: "UPDATE guidelines SET active = 0, updated_at = ? WHERE id = ?",
              args: [t, current.id]
            }
          ]
        : []),
      {
        sql: `INSERT INTO guidelines (
                id, account_id, target, concept, tone, content_pillars_json, ng_rules_json,
                cta_policy, hashtag_policy, job_pick_enabled, system_prompt, version, active,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        args: [
          nextId,
          accountId,
          input.target,
          input.concept,
          input.tone,
          JSON.stringify(input.contentPillars),
          JSON.stringify(input.ngRules),
          input.ctaPolicy,
          input.hashtagPolicy,
          input.jobPickEnabled ? 1 : 0,
          input.systemPrompt,
          version,
          t,
          t
        ]
      }
    ];
    await this.client.batch(statements, "write");
    const created = await this.getActiveGuideline(accountId);
    if (!created) throw new Error("Failed to upsert guideline");
    return created;
  }

  async listReferences(accountId: string, kind?: ReferenceKind) {
    const result = kind
      ? await this.client.execute({
          sql: `SELECT * FROM content_references
                WHERE account_id = ? AND active = 1 AND kind = ?
                ORDER BY created_at DESC`,
          args: [accountId, kind]
        })
      : await this.client.execute({
          sql: `SELECT * FROM content_references
                WHERE account_id = ? AND active = 1
                ORDER BY created_at DESC`,
          args: [accountId]
        });
    return result.rows.map(mapReferenceRow);
  }

  async createReference(accountId: string, input: ReferenceCreate) {
    const rowId = id("ref");
    const t = nowIso();
    await this.client.execute({
      sql: `INSERT INTO content_references (
              id, account_id, kind, title, source_note, structure_json, examples_text, active,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        rowId,
        accountId,
        input.kind,
        input.title,
        input.sourceNote ?? "",
        input.structureJson != null ? JSON.stringify(input.structureJson) : null,
        input.examplesText ?? "",
        (input.active ?? true) ? 1 : 0,
        t,
        t
      ]
    });
    const result = await this.client.execute({
      sql: "SELECT * FROM content_references WHERE id = ?",
      args: [rowId]
    });
    return mapReferenceRow(result.rows[0]!);
  }

  async updateReference(
    referenceId: string,
    fields: Partial<ReferenceCreate> & { active?: boolean }
  ) {
    const result = await this.client.execute({
      sql: "SELECT * FROM content_references WHERE id = ?",
      args: [referenceId]
    });
    const current = result.rows[0];
    if (!current) return null;
    const mapped = mapReferenceRow(current);
    await this.client.execute({
      sql: `UPDATE content_references SET
              kind = ?, title = ?, source_note = ?, structure_json = ?, examples_text = ?,
              active = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        fields.kind ?? mapped.kind,
        fields.title ?? mapped.title,
        fields.sourceNote ?? mapped.sourceNote,
        fields.structureJson !== undefined
          ? fields.structureJson != null
            ? JSON.stringify(fields.structureJson)
            : null
          : mapped.structureJson != null
            ? JSON.stringify(mapped.structureJson)
            : null,
        fields.examplesText ?? mapped.examplesText,
        (fields.active ?? mapped.active) ? 1 : 0,
        nowIso(),
        referenceId
      ]
    });
    const updated = await this.client.execute({
      sql: "SELECT * FROM content_references WHERE id = ?",
      args: [referenceId]
    });
    return updated.rows[0] ? mapReferenceRow(updated.rows[0]) : null;
  }

  async deleteReference(referenceId: string) {
    const result = await this.client.execute({
      sql: "DELETE FROM content_references WHERE id = ?",
      args: [referenceId]
    });
    return (result.rowsAffected ?? 0) > 0;
  }

  async listMemory(accountId: string, kinds?: MemoryKind[]) {
    const result = await this.client.execute({
      sql: `SELECT * FROM memory_items WHERE account_id = ? ORDER BY created_at DESC`,
      args: [accountId]
    });
    const rows = result.rows.map(mapMemoryRow);
    return kinds ? rows.filter((m) => kinds.includes(m.kind)) : rows;
  }

  async createMemoryItem(item: Omit<MemoryItem, "id" | "createdAt"> & { id?: string }) {
    const rowId = item.id ?? id("mem");
    const t = nowIso();
    await this.client.execute({
      sql: `INSERT INTO memory_items (
              id, account_id, kind, topic_key, content, source_post_id, source_idea_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        rowId,
        item.accountId,
        item.kind,
        item.topicKey,
        item.content,
        item.sourcePostId ?? null,
        item.sourceIdeaId ?? null,
        t
      ]
    });
    return {
      id: rowId,
      accountId: item.accountId,
      kind: item.kind,
      topicKey: item.topicKey,
      content: item.content,
      sourcePostId: item.sourcePostId,
      sourceIdeaId: item.sourceIdeaId,
      createdAt: t
    };
  }

  async deleteMemoryItem(memoryId: string) {
    const result = await this.client.execute({
      sql: "DELETE FROM memory_items WHERE id = ?",
      args: [memoryId]
    });
    return (result.rowsAffected ?? 0) > 0;
  }

  async getIdea(ideaId: string) {
    const result = await this.client.execute({
      sql: "SELECT * FROM ideas WHERE id = ?",
      args: [ideaId]
    });
    return result.rows[0] ? mapIdeaRow(result.rows[0]) : null;
  }

  async listIdeas(accountId: string, status?: IdeaStatus) {
    const result = status
      ? await this.client.execute({
          sql: `SELECT * FROM ideas WHERE account_id = ? AND status = ? ORDER BY created_at DESC`,
          args: [accountId, status]
        })
      : await this.client.execute({
          sql: `SELECT * FROM ideas WHERE account_id = ? ORDER BY created_at DESC`,
          args: [accountId]
        });
    return result.rows.map(mapIdeaRow);
  }

  async createIdeas(ideas: Omit<Idea, "id" | "createdAt" | "updatedAt">[]) {
    const t = nowIso();
    const created: Idea[] = ideas.map((idea) => ({
      ...idea,
      id: id("idea"),
      createdAt: t,
      updatedAt: t
    }));
    if (created.length === 0) return created;
    await this.client.batch(
      created.map((idea) => ({
        sql: `INSERT INTO ideas (
                id, account_id, title, summary, pillar, topic_key, hook, angle,
                reference_ids_json, job_id, status, agent_run_id, score, rationale,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          idea.id,
          idea.accountId,
          idea.title,
          idea.summary,
          idea.pillar,
          idea.topicKey,
          idea.hook,
          idea.angle,
          JSON.stringify(idea.referenceIds),
          idea.jobId ?? null,
          idea.status,
          idea.agentRunId ?? null,
          idea.score ?? null,
          idea.rationale,
          t,
          t
        ]
      })),
      "write"
    );
    return created;
  }

  async updateIdea(
    ideaId: string,
    fields: Partial<Pick<Idea, "status" | "jobId" | "score" | "rationale">>
  ) {
    const result = await this.client.execute({
      sql: "SELECT * FROM ideas WHERE id = ?",
      args: [ideaId]
    });
    const current = result.rows[0];
    if (!current) return null;
    const mapped = mapIdeaRow(current);
    await this.client.execute({
      sql: `UPDATE ideas SET status = ?, job_id = ?, score = ?, rationale = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        fields.status ?? mapped.status,
        fields.jobId !== undefined ? fields.jobId : (mapped.jobId ?? null),
        fields.score !== undefined ? fields.score : (mapped.score ?? null),
        fields.rationale ?? mapped.rationale,
        nowIso(),
        ideaId
      ]
    });
    const updated = await this.client.execute({
      sql: "SELECT * FROM ideas WHERE id = ?",
      args: [ideaId]
    });
    return updated.rows[0] ? mapIdeaRow(updated.rows[0]) : null;
  }

  async ensurePhase1Seed() {
    const existing = await this.getAccount("acc_001");
    if (existing) {
      return { seeded: false, accountId: "acc_001" };
    }
    const seed = createPhase1Seed();
    await this.createAccount(seed.account);
    await this.client.execute({
      sql: `INSERT INTO guidelines (
              id, account_id, target, concept, tone, content_pillars_json, ng_rules_json,
              cta_policy, hashtag_policy, job_pick_enabled, system_prompt, version, active,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      args: [
        seed.guideline.id,
        seed.guideline.accountId,
        seed.guideline.target,
        seed.guideline.concept,
        seed.guideline.tone,
        JSON.stringify(seed.guideline.contentPillars),
        JSON.stringify(seed.guideline.ngRules),
        seed.guideline.ctaPolicy,
        seed.guideline.hashtagPolicy,
        seed.guideline.jobPickEnabled ? 1 : 0,
        seed.guideline.systemPrompt,
        seed.guideline.version,
        seed.guideline.createdAt,
        seed.guideline.updatedAt
      ]
    });
    await this.client.batch(
      seed.references.map((ref) => ({
        sql: `INSERT INTO content_references (
                id, account_id, kind, title, source_note, structure_json, examples_text, active,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          ref.id,
          ref.accountId,
          ref.kind,
          ref.title,
          ref.sourceNote,
          ref.structureJson != null ? JSON.stringify(ref.structureJson) : null,
          ref.examplesText,
          ref.active ? 1 : 0,
          ref.createdAt,
          ref.updatedAt
        ]
      })),
      "write"
    );
    await this.client.batch(
      seed.ideas.map((idea) => ({
        sql: `INSERT INTO ideas (
                id, account_id, title, summary, pillar, topic_key, hook, angle,
                reference_ids_json, job_id, status, agent_run_id, score, rationale,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          idea.id,
          idea.accountId,
          idea.title,
          idea.summary,
          idea.pillar,
          idea.topicKey,
          idea.hook,
          idea.angle,
          JSON.stringify(idea.referenceIds),
          idea.jobId ?? null,
          idea.status,
          idea.agentRunId ?? null,
          idea.score ?? null,
          idea.rationale,
          idea.createdAt,
          idea.updatedAt
        ]
      })),
      "write"
    );
    if (seed.jobs.length > 0) {
      await this.client.batch(
        seed.jobs.map((job) => ({
          sql: "INSERT INTO jobs (id, company, role, location, url) VALUES (?, ?, ?, ?, ?)",
          args: [job.id, job.company, job.role, job.location, job.url]
        })),
        "write"
      );
    }
    return { seeded: true, accountId: seed.account.id };
  }
}

function mapAccountRow(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    name: String(row.name),
    instagramHandle: String(row.instagram_handle),
    canvaTemplateId: String(row.canva_template_id),
    tone: String(row.tone)
  };
}

function mapPostRow(row: Record<string, unknown>): Post {
  const status = String(row.status);
  if (!["draft", "approved", "scheduled", "published", "rejected", "failed"].includes(status)) {
    throw new Error(`Unexpected post status in DB: ${status}`);
  }
  const generationStatus = assertEnum(
    row.generation_status ? String(row.generation_status) : "ready",
    GENERATION_STATUSES,
    "generation status"
  );
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    title: String(row.title),
    caption: String(row.caption),
    status: status as PostStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ideaId: row.idea_id ? String(row.idea_id) : undefined,
    postType: row.post_type
      ? assertEnum(String(row.post_type), POST_TYPES, "post type")
      : undefined,
    slidesJson: parseJsonUnknown(row.slides_json) ?? undefined,
    hashtags: parseJsonArray(row.hashtags_json),
    scheduledAt: row.scheduled_at == null ? null : String(row.scheduled_at),
    generationStatus: generationStatus as Post["generationStatus"],
    generationError: row.generation_error == null ? null : String(row.generation_error),
    rejectReason: row.reject_reason == null ? null : String(row.reject_reason)
  };
}

function mapAssetRow(row: Record<string, unknown>): PostAsset {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    imageUrl: String(row.image_url),
    canvaDesignId: row.canva_design_id ? String(row.canva_design_id) : undefined,
    slideIndex: row.slide_index == null ? 0 : Number(row.slide_index),
    templateId: row.template_id ? String(row.template_id) : undefined
  };
}

function sqliteBool(value: unknown): boolean {
  return Number(value) !== 0;
}

function assertEnum<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Unexpected ${label} in DB: ${value}`);
}

const REFERENCE_KINDS = [
  "slide_pattern",
  "hook_pattern",
  "voice_sample",
  "doc",
  "url_note"
] as const;
const MEMORY_KINDS = [
  "topic_used",
  "hook_used",
  "idea_rejected",
  "editor_feedback",
  "preference"
] as const;
const IDEA_STATUSES = ["queued", "selected", "rejected", "used"] as const;
const POST_TYPES = ["knowhow", "job_pick"] as const;
const GENERATION_STATUSES = [
  "pending",
  "generating_copy",
  "rendering",
  "ready",
  "failed"
] as const;

function mapGuidelineRow(row: Record<string, unknown>): Guideline {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    target: String(row.target),
    concept: String(row.concept),
    tone: String(row.tone),
    contentPillars: parseJsonArray(row.content_pillars_json),
    ngRules: parseJsonArray(row.ng_rules_json),
    ctaPolicy: String(row.cta_policy ?? ""),
    hashtagPolicy: String(row.hashtag_policy ?? ""),
    jobPickEnabled: sqliteBool(row.job_pick_enabled),
    systemPrompt: String(row.system_prompt ?? ""),
    version: Number(row.version),
    active: sqliteBool(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapReferenceRow(row: Record<string, unknown>): Reference {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    kind: assertEnum(String(row.kind), REFERENCE_KINDS, "reference kind"),
    title: String(row.title),
    sourceNote: String(row.source_note ?? ""),
    structureJson: parseJsonUnknown(row.structure_json),
    examplesText: String(row.examples_text ?? ""),
    active: sqliteBool(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapMemoryRow(row: Record<string, unknown>): MemoryItem {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    kind: assertEnum(String(row.kind), MEMORY_KINDS, "memory kind"),
    topicKey: String(row.topic_key),
    content: String(row.content),
    sourcePostId: row.source_post_id == null ? null : String(row.source_post_id),
    sourceIdeaId: row.source_idea_id == null ? null : String(row.source_idea_id),
    createdAt: String(row.created_at)
  };
}

function mapIdeaRow(row: Record<string, unknown>): Idea {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    title: String(row.title),
    summary: String(row.summary),
    pillar: String(row.pillar),
    topicKey: String(row.topic_key),
    hook: String(row.hook ?? ""),
    angle: String(row.angle ?? ""),
    referenceIds: parseJsonArray(row.reference_ids_json),
    jobId: row.job_id == null ? null : String(row.job_id),
    status: assertEnum(String(row.status), IDEA_STATUSES, "idea status"),
    agentRunId: row.agent_run_id == null ? null : String(row.agent_run_id),
    score: row.score == null ? undefined : Number(row.score),
    rationale: String(row.rationale ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export type RepositoryOptions = {
  tursoUrl?: string;
  tursoAuthToken?: string;
};

export function createRepository(options: RepositoryOptions): Repository {
  if (options.tursoUrl && options.tursoAuthToken) {
    const client = createClient({
      url: options.tursoUrl,
      authToken: options.tursoAuthToken
    });
    return new TursoRepository(client);
  }
  return new MockRepository();
}

export { createPhase1Seed } from "./seed";
