import { createClient, type Client } from "@libsql/client";
import type { Account, AgentRun, Job, Post, PostAsset } from "@ama/shared";

type PostStatus = Post["status"];

export type DraftInput = {
  accountId: string;
  title: string;
  caption: string;
  assets: Array<{ imageUrl: string; canvaDesignId?: string }>;
};

export interface Repository {
  mode: "mock" | "turso";
  listJobs(): Promise<Job[]>;
  listPosts(): Promise<Post[]>;
  getPost(postId: string): Promise<{ post: Post; assets: PostAsset[] } | null>;
  listPostsByAccount(accountId: string, limit: number): Promise<Post[]>;
  getAccount(accountId: string): Promise<Account | null>;
  listAccounts(): Promise<Account[]>;
  createPostDraft(input: DraftInput): Promise<{ post: Post; assets: PostAsset[] }>;
  updatePost(postId: string, fields: { title?: string; caption?: string; status?: PostStatus }): Promise<Post | null>;
  setPostStatus(postId: string, status: PostStatus): Promise<Post | null>;
  createAgentRun(run: AgentRun): Promise<void>;
}

const nowIso = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function seedMockData() {
  const account: Account = {
    id: "acc_001",
    name: "Anchor Recruit JP",
    instagramHandle: "@anchor_recruit",
    canvaTemplateId: "tpl_recruit_01",
    tone: "friendly, practical, career-focused"
  };
  const jobs: Job[] = [
    {
      id: "job_001",
      company: "Anchor Data",
      role: "Data Analyst",
      location: "Tokyo",
      url: "https://example.com/jobs/1"
    },
    {
      id: "job_002",
      company: "Anchor Data",
      role: "Backend Engineer",
      location: "Osaka",
      url: "https://example.com/jobs/2"
    }
  ];
  const t = nowIso();
  const posts: Post[] = [
    {
      id: "post_001",
      accountId: account.id,
      title: "Data Analyst in Tokyo",
      caption: "Tokyo hiring: Data Analyst role now open.",
      status: "draft",
      createdAt: t,
      updatedAt: t
    }
  ];
  const assets: PostAsset[] = [
    {
      id: "asset_001",
      postId: "post_001",
      imageUrl: "https://images.example.com/post_001_1.png",
      canvaDesignId: "design_001"
    }
  ];
  return { account, jobs, posts, assets };
}

class MockRepository implements Repository {
  mode: "mock" = "mock";
  private seed = seedMockData();
  private accounts = [this.seed.account];
  private jobs = this.seed.jobs;
  private posts = this.seed.posts;
  private assets = this.seed.assets;
  private agentRuns: AgentRun[] = [];

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
  async createPostDraft(input: DraftInput) {
    const post: Post = {
      id: id("post"),
      accountId: input.accountId,
      title: input.title,
      caption: input.caption,
      status: "draft",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const assets = input.assets.map((asset) => ({
      id: id("asset"),
      postId: post.id,
      imageUrl: asset.imageUrl,
      canvaDesignId: asset.canvaDesignId
    }));
    this.posts.unshift(post);
    this.assets.push(...assets);
    return { post, assets };
  }
  async setPostStatus(postId: string, status: PostStatus) {
    const post = this.posts.find((p) => p.id === postId);
    if (!post) return null;
    post.status = status;
    post.updatedAt = nowIso();
    return post;
  }
  async updatePost(
    postId: string,
    fields: { title?: string; caption?: string; status?: PostStatus }
  ) {
    const post = this.posts.find((p) => p.id === postId);
    if (!post) return null;
    if (fields.title !== undefined) post.title = fields.title;
    if (fields.caption !== undefined) post.caption = fields.caption;
    if (fields.status !== undefined) post.status = fields.status;
    post.updatedAt = nowIso();
    return post;
  }
  async createAgentRun(run: AgentRun) {
    this.agentRuns.push(run);
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
      "SELECT id, account_id, title, caption, status, created_at, updated_at FROM posts ORDER BY created_at DESC"
    );
    return result.rows.map(mapPostRow);
  }

  async getPost(postId: string) {
    const postResult = await this.client.execute({
      sql: "SELECT id, account_id, title, caption, status, created_at, updated_at FROM posts WHERE id = ?",
      args: [postId]
    });
    const first = postResult.rows[0];
    if (!first) return null;

    const assetsResult = await this.client.execute({
      sql: "SELECT id, post_id, image_url, canva_design_id FROM post_assets WHERE post_id = ?",
      args: [postId]
    });
    return {
      post: mapPostRow(first),
      assets: assetsResult.rows.map((row) => ({
        id: String(row.id),
        postId: String(row.post_id),
        imageUrl: String(row.image_url),
        canvaDesignId: row.canva_design_id ? String(row.canva_design_id) : undefined
      }))
    };
  }

  async listPostsByAccount(accountId: string, limit: number) {
    const result = await this.client.execute({
      sql: "SELECT id, account_id, title, caption, status, created_at, updated_at FROM posts WHERE account_id = ? ORDER BY created_at DESC LIMIT ?",
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
    return {
      id: String(row.id),
      name: String(row.name),
      instagramHandle: String(row.instagram_handle),
      canvaTemplateId: String(row.canva_template_id),
      tone: String(row.tone)
    };
  }

  async listAccounts() {
    const result = await this.client.execute(
      "SELECT id, name, instagram_handle, canva_template_id, tone FROM accounts ORDER BY created_at DESC"
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      instagramHandle: String(row.instagram_handle),
      canvaTemplateId: String(row.canva_template_id),
      tone: String(row.tone)
    }));
  }

  async createPostDraft(input: DraftInput) {
    const postId = id("post");
    const t = nowIso();
    await this.client.batch(
      [
        {
          sql: "INSERT INTO posts (id, account_id, title, caption, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          args: [postId, input.accountId, input.title, input.caption, "draft", t, t]
        },
        ...input.assets.map((asset) => ({
          sql: "INSERT INTO post_assets (id, post_id, image_url, canva_design_id) VALUES (?, ?, ?, ?)",
          args: [id("asset"), postId, asset.imageUrl, asset.canvaDesignId ?? null]
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
    fields: { title?: string; caption?: string; status?: PostStatus }
  ) {
    const current = await this.getPost(postId);
    if (!current) return null;
    await this.client.execute({
      sql: "UPDATE posts SET title = ?, caption = ?, status = ?, updated_at = ? WHERE id = ?",
      args: [
        fields.title ?? current.post.title,
        fields.caption ?? current.post.caption,
        fields.status ?? current.post.status,
        nowIso(),
        postId
      ]
    });
    const updated = await this.getPost(postId);
    return updated?.post ?? null;
  }

  async setPostStatus(postId: string, status: PostStatus) {
    await this.client.execute({
      sql: "UPDATE posts SET status = ?, updated_at = ? WHERE id = ?",
      args: [status, nowIso(), postId]
    });
    const detail = await this.getPost(postId);
    return detail?.post ?? null;
  }

  async createAgentRun(run: AgentRun) {
    await this.client.execute({
      sql: "INSERT INTO agent_runs (id, account_id, created_post_id, summary, output_json) VALUES (?, ?, ?, ?, ?)",
      args: [run.id, run.accountId, run.createdPostId, run.summary, JSON.stringify(run.outputJson)]
    });
  }
}

function mapPostRow(row: Record<string, unknown>): Post {
  const status = String(row.status);
  if (!["draft", "approved", "scheduled", "published"].includes(status)) {
    throw new Error(`Unexpected post status in DB: ${status}`);
  }
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    title: String(row.title),
    caption: String(row.caption),
    status: status as Post["status"],
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
