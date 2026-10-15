import type { Guideline, Idea, Job, MemoryItem, Post, Reference } from "@ama/shared";
import { NotConfiguredError } from "./errors";

export type IdeationToolContext = {
  getGuideline: (accountId: string) => Promise<Guideline | null>;
  listReferences: (accountId: string) => Promise<Reference[]>;
  getMemory: (accountId: string) => Promise<MemoryItem[]>;
  getPreviousPosts: (accountId: string, limit: number) => Promise<Post[]>;
  getCandidateJobs: () => Promise<Job[]>;
  listQueuedIdeas: (accountId: string) => Promise<Idea[]>;
};

export type IdeationRunInput = {
  accountId: string;
  count: number;
  seedText?: string;
  seedUrl?: string;
};

export type IdeationCandidate = Omit<Idea, "id" | "createdAt" | "updatedAt">;

export type IdeationRunOutput = {
  summary: string;
  ideas: IdeationCandidate[];
  reasoning: string[];
};

export interface IdeationAgent {
  mode: "mock" | "openai";
  run(input: IdeationRunInput, tools: IdeationToolContext): Promise<IdeationRunOutput>;
}

function normalizeTopicKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 80);
}

function usedTopicKeys(
  memory: MemoryItem[],
  posts: Post[],
  queued: Idea[]
): Set<string> {
  const keys = new Set<string>();
  for (const item of memory) {
    if (item.kind === "topic_used" || item.kind === "idea_rejected") {
      keys.add(item.topicKey);
    }
  }
  for (const post of posts) {
    keys.add(normalizeTopicKey(post.title));
  }
  for (const idea of queued) {
    keys.add(idea.topicKey);
  }
  return keys;
}

/** Deterministic ideation for local/CI — no OpenAI required. */
export class MockIdeationAgent implements IdeationAgent {
  mode: "mock" = "mock";

  async run(input: IdeationRunInput, tools: IdeationToolContext): Promise<IdeationRunOutput> {
    const [guideline, references, memory, posts, queued, jobs] = await Promise.all([
      tools.getGuideline(input.accountId),
      tools.listReferences(input.accountId),
      tools.getMemory(input.accountId),
      tools.getPreviousPosts(input.accountId, 20),
      tools.listQueuedIdeas(input.accountId),
      tools.getCandidateJobs()
    ]);

    if (!guideline) {
      throw new Error(`No active guideline for account ${input.accountId}`);
    }

    const blocked = usedTopicKeys(memory, posts, queued);
    const slideRef = references.find((r) => r.kind === "slide_pattern" && r.active);
    const hooks = references.filter((r) => r.kind === "hook_pattern" && r.active);
    const pillars =
      guideline.contentPillars.length > 0 ? guideline.contentPillars : ["転職準備"];

    const seed = input.seedText?.trim() ?? "";
    const templates: Array<{ title: string; summary: string; hook: string; angle: string }> = [
      {
        title: seed
          ? `${seed.slice(0, 18)}${seed.length > 18 ? "…" : ""}を分かりやすく解説`
          : "転職で後悔しない人がやっている3つの準備",
        summary:
          "在職中にできる準備を3ステップで整理する解説カルーセル。勢いで辞める前のチェックに使う。",
        hook: hooks[0]?.examplesText || "辞めたい気持ちだけで動くと、選択肢が狭まります",
        angle: "在職中の準備に絞る"
      },
      {
        title: "求人票で見落とされがちなチェックポイント",
        summary: "給与以外に見るべき条件を整理し、保存したくなるチェックリスト型の投稿。",
        hook: hooks[1]?.examplesText || "求人票、ここだけは見てほしい",
        angle: "チェックリスト"
      },
      {
        title: "面接前夜にやるべきことリスト",
        summary: "緊張しやすい方向けに、前日の準備を短くまとめた実践ガイド。",
        hook: hooks[2]?.examplesText || "面接前夜、これだけはやっておこう",
        angle: "面接準備"
      },
      {
        title: "職務経歴書で差がつく書き方の型",
        summary: "実績の書き方テンプレをスライドで分解。初めての転職でも使える構成。",
        hook: "職務経歴書、なんとなく書いてませんか",
        angle: "書類対策"
      },
      {
        title: "年収交渉で使える伝え方の順番",
        summary: "希望年収の伝え方をステップ化し、押し売りにならない言い回し例を添える。",
        hook: "年収交渉、いきなり金額を言ってない？",
        angle: "交渉"
      }
    ];

    const ideas: IdeationCandidate[] = [];
    const reasoning: string[] = [
      `Guideline target: ${guideline.target}`,
      `References loaded: ${references.length} (slide pattern: ${slideRef ? "yes" : "no"})`,
      `Blocked topic keys: ${blocked.size}`,
      seed ? `Seed text applied (${seed.length} chars)` : "No seed text",
      input.seedUrl ? `Seed URL noted: ${input.seedUrl}` : "No seed URL"
    ];

    for (const template of templates) {
      if (ideas.length >= input.count) break;
      const pillar = pillars[ideas.length % pillars.length] ?? pillars[0]!;
      const topicKey = normalizeTopicKey(`${pillar}.${template.title}`);
      if (blocked.has(topicKey) || blocked.has(normalizeTopicKey(template.title))) {
        reasoning.push(`Skipped duplicate topic: ${topicKey}`);
        continue;
      }
      blocked.add(topicKey);

      const job =
        guideline.jobPickEnabled && jobs[0]
          ? jobs[ideas.length % jobs.length]
          : undefined;

      ideas.push({
        accountId: input.accountId,
        title: template.title,
        summary: template.summary,
        pillar,
        topicKey,
        hook: template.hook,
        angle: template.angle,
        referenceIds: [slideRef?.id, hooks[ideas.length]?.id].filter(Boolean) as string[],
        jobId: job?.id ?? null,
        status: "queued",
        agentRunId: null,
        score: 1 - ideas.length * 0.05,
        rationale: `Matches pillar「${pillar}」and guideline NG rules. Inspired-by structure only.`
      });
    }

    if (ideas.length === 0) {
      throw new Error("No new ideas could be generated (all candidates blocked by memory)");
    }

    return {
      summary: `Generated ${ideas.length} ideation candidates for ${guideline.target}`,
      ideas,
      reasoning
    };
  }
}

export class OpenAIIdeationAgent implements IdeationAgent {
  mode: "openai" = "openai";
  constructor(private apiKey?: string) {}

  async run(): Promise<IdeationRunOutput> {
    if (!this.apiKey) {
      throw new NotConfiguredError("OpenAI Ideation");
    }
    throw new Error("OpenAI ideation agent is not implemented yet — use AGENT_MODE=mock");
  }
}

export function createIdeationAgent(options: {
  agentMode?: "mock" | "openai";
  openAiApiKey?: string;
}): IdeationAgent {
  if (options.agentMode === "openai") {
    return new OpenAIIdeationAgent(options.openAiApiKey);
  }
  return new MockIdeationAgent();
}
