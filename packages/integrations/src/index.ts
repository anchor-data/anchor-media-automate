import type { Account, Job, Post } from "@ama/shared";

export class NotConfiguredError extends Error {
  constructor(service: string) {
    super(`${service} is not configured`);
    this.name = "NotConfiguredError";
  }
}

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

export class CanvaApiClient implements CanvaClient {
  mode: "canva" = "canva";
  constructor(private apiKey?: string) {}
  async autofill(input: { templateId: string; title: string; subtitle: string }): Promise<{ designId: string }> {
    if (!this.apiKey) {
      throw new NotConfiguredError("Canva API");
    }
    throw new Error(`Canva autofill is not implemented in v0 for template ${input.templateId}`);
  }
  async getExportUrl(designId: string): Promise<string> {
    if (!this.apiKey) {
      throw new NotConfiguredError("Canva API");
    }
    throw new Error(`Canva export is not implemented in v0 for design ${designId}`);
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
  agentMode?: "mock" | "openai";
  openAiApiKey?: string;
  canvaApiKey?: string;
  instagramAccessToken?: string;
};

export function createAgentRunner(options: IntegrationOptions): AgentRunner {
  if (options.agentMode === "openai") {
    return new OpenAIAgentsRunner(options.openAiApiKey);
  }
  return new MockAgentRunner();
}

export function createCanvaClient(options: IntegrationOptions): CanvaClient {
  if (options.canvaApiKey) {
    return new CanvaApiClient(options.canvaApiKey);
  }
  return new MockCanvaClient();
}

export function createInstagramClient(options: IntegrationOptions): InstagramClient {
  if (options.instagramAccessToken) {
    return new InstagramGraphClient(options.instagramAccessToken);
  }
  return new MockInstagramClient();
}
