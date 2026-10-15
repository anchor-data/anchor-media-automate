import type { Account, Job, Post } from "@ama/shared";
export { NotConfiguredError } from "./errors";
export {
  createIdeationAgent,
  MockIdeationAgent,
  OpenAIIdeationAgent,
  type IdeationAgent,
  type IdeationCandidate,
  type IdeationRunInput,
  type IdeationRunOutput,
  type IdeationToolContext
} from "./ideation";
import { NotConfiguredError } from "./errors";

export type AgentToolContext = {
  getCandidateJobs: () => Promise<Job[]>;
  getPreviousPosts: (accountId: string, limit: number) => Promise<Post[]>;
  getAccountConfig: (accountId: string) => Promise<Account | null>;
  createPostDraft: (input: {
    accountId: string;
    title: string;
    caption: string;
    assets: Array<{ imageUrl: string; canvaDesignId?: string }>;
  }) => Promise<{ post: Post }>;
  regeneratePost: (post: Post) => Promise<Post>;
};

export type AgentRunInput = {
  accountId: string;
  limit: number;
};

export type AgentRunOutput = {
  summary: string;
  post: {
    accountId: string;
    title: string;
    caption: string;
    assets: Array<{ imageUrl: string; canvaDesignId?: string }>;
  };
  reasoning: string[];
};

export interface AgentRunner {
  mode: "mock" | "openai";
  run(input: AgentRunInput, tools: AgentToolContext): Promise<AgentRunOutput>;
  regenerate(post: Post, tools: AgentToolContext): Promise<Post>;
}

export interface CanvaClient {
  mode: "mock" | "canva";
  autofill(input: {
    templateId: string;
    title: string;
    subtitle: string;
  }): Promise<{ designId: string }>;
  getExportUrl(designId: string): Promise<string>;
}

export interface InstagramClient {
  mode: "mock" | "instagram";
  publishCarousel(input: {
    accountId: string;
    caption: string;
    imageUrls: string[];
  }): Promise<{ postId: string; permalink: string }>;
  getInsights(postId: string): Promise<{
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
  }>;
}

export class MockAgentRunner implements AgentRunner {
  mode: "mock" = "mock";
  async run(input: AgentRunInput, tools: AgentToolContext): Promise<AgentRunOutput> {
    const [jobs, account] = await Promise.all([
      tools.getCandidateJobs(),
      tools.getAccountConfig(input.accountId)
    ]);
    if (!account) {
      throw new Error(`Account not found: ${input.accountId}`);
    }
    const target = jobs.slice(0, input.limit)[0];
    if (!target) {
      throw new Error("No jobs available for draft generation");
    }
    return {
      summary: `Generated draft from ${Math.min(jobs.length, input.limit)} candidate jobs`,
      post: {
        accountId: input.accountId,
        title: `${target.role} | ${target.company}`,
        caption: `${target.company} is hiring a ${target.role} in ${target.location}. Apply now: ${target.url}`,
        assets: [
          {
            imageUrl: `https://images.example.com/${target.id}.png`,
            canvaDesignId: `design_${target.id}`
          }
        ]
      },
      reasoning: [
        "Selected the highest-priority job from candidate list",
        `Applied tone: ${account.tone}`,
        "Built CTA caption with direct application URL"
      ]
    };
  }
  async regenerate(post: Post): Promise<Post> {
    return {
      ...post,
      caption: `${post.caption}\n\n#recruit #career #hiring`,
      updatedAt: new Date().toISOString()
    };
  }
}

export class OpenAIAgentsRunner implements AgentRunner {
  mode: "openai" = "openai";
  constructor(private apiKey?: string) {}
  async run(): Promise<AgentRunOutput> {
    if (!this.apiKey) {
      throw new NotConfiguredError("OpenAI Agents");
    }
    throw new Error("OpenAI runner is not implemented in v0");
  }
  async regenerate(post: Post): Promise<Post> {
    if (!this.apiKey) {
      throw new NotConfiguredError("OpenAI Agents");
    }
    throw new Error(`OpenAI regenerate is not implemented in v0 for ${post.id}`);
  }
}

export class MockCanvaClient implements CanvaClient {
  mode: "mock" = "mock";
  async autofill(input: { templateId: string; title: string; subtitle: string }) {
    return { designId: `design_${input.templateId}` };
  }
  async getExportUrl(designId: string) {
    return `https://images.example.com/${designId}.png`;
  }
}

const CANVA_BASE_URL = "https://api.canva.com/rest/v1";
const CANVA_POLL_INTERVAL_MS = 1000;
const CANVA_POLL_MAX_ATTEMPTS = 30;

export type CanvaCredentials = {
  clientId?: string;
  clientSecret?: string;
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

export class CanvaApiClient implements CanvaClient {
  mode: "canva" = "canva";
  private token?: { value: string; expiresAt: number };

  constructor(private credentials: CanvaCredentials) {}

  async autofill(input: { templateId: string; title: string; subtitle: string }): Promise<{ designId: string }> {
    const created = await this.request<CanvaJob>("POST", "/autofills", {
      brand_template_id: input.templateId,
      data: {
        title: { type: "text", text: input.title },
        subtitle: { type: "text", text: input.subtitle }
      }
    });
    const done = await this.poll(`/autofills/${created.job.id}`, created);
    const designId = done.job.result?.design?.id;
    if (!designId) {
      throw new Error("Canva autofill finished without a design id");
    }
    return { designId };
  }

  async getExportUrl(designId: string): Promise<string> {
    const created = await this.request<CanvaJob>("POST", "/exports", {
      design_id: designId,
      format: { type: "png" }
    });
    const done = await this.poll(`/exports/${created.job.id}`, created);
    const url = done.job.urls?.[0];
    if (!url) {
      throw new Error("Canva export finished without a download url");
    }
    return url;
  }

  private async poll(path: string, initial: CanvaJob): Promise<CanvaJob> {
    let current = initial;
    for (let i = 0; i < CANVA_POLL_MAX_ATTEMPTS; i++) {
      if (current.job.status === "success") return current;
      if (current.job.status === "failed") {
        throw new Error(`Canva job failed: ${current.job.error?.message ?? "unknown error"}`);
      }
      await new Promise((resolve) => setTimeout(resolve, CANVA_POLL_INTERVAL_MS));
      current = await this.request<CanvaJob>("GET", path);
    }
    throw new Error("Canva job timed out");
  }

  // Client-credentials grant: only the client id and secret are needed.
  private async getAccessToken(): Promise<string> {
    const { clientId, clientSecret } = this.credentials;
    if (!clientId || !clientSecret) {
      throw new NotConfiguredError("Canva API");
    }
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.value;
    }
    const response = await fetch(`${CANVA_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ grant_type: "client_credentials" })
    });
    if (!response.ok) {
      throw new Error(`Canva token request failed (${response.status}): ${await response.text()}`);
    }
    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(`${CANVA_BASE_URL}${path}`, {
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

export class MockInstagramClient implements InstagramClient {
  mode: "mock" = "mock";
  async publishCarousel(input: {
    accountId: string;
    caption: string;
    imageUrls: string[];
  }): Promise<{ postId: string; permalink: string }> {
    const postId = `ig_${crypto.randomUUID()}`;
    return { postId, permalink: `https://instagram.com/p/${postId}` };
  }
  async getInsights() {
    return { impressions: 1450, reach: 1022, likes: 84, comments: 9 };
  }
}

export class InstagramGraphClient implements InstagramClient {
  mode: "instagram" = "instagram";
  constructor(private accessToken?: string) {}
  async publishCarousel(input: {
    accountId: string;
    caption: string;
    imageUrls: string[];
  }): Promise<{ postId: string; permalink: string }> {
    if (!this.accessToken) {
      throw new NotConfiguredError("Instagram Graph API");
    }
    throw new Error(`Instagram publish is not implemented in v0 for account ${input.accountId}`);
  }
  async getInsights(postId: string): Promise<{
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
  }> {
    if (!this.accessToken) {
      throw new NotConfiguredError("Instagram Graph API");
    }
    throw new Error(`Instagram insights is not implemented in v0 for post ${postId}`);
  }
}

export type IntegrationOptions = {
  openAiApiKey?: string;
  canvaClientId?: string;
  canvaClientSecret?: string;
  instagramAccessToken?: string;
};

/** Always use live OpenAI Agents path. MockAgentRunner remains for tests only. */
export function createAgentRunner(options: IntegrationOptions): AgentRunner {
  return new OpenAIAgentsRunner(options.openAiApiKey);
}

export function createCanvaClient(options: IntegrationOptions): CanvaClient {
  if (options.canvaClientId && options.canvaClientSecret) {
    return new CanvaApiClient({
      clientId: options.canvaClientId,
      clientSecret: options.canvaClientSecret
    });
  }
  return new MockCanvaClient();
}

export function createInstagramClient(options: IntegrationOptions): InstagramClient {
  if (options.instagramAccessToken) {
    return new InstagramGraphClient(options.instagramAccessToken);
  }
  return new MockInstagramClient();
}
