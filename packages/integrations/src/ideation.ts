import { Agent, run, setDefaultOpenAIKey, tool } from "@openai/agents";
import { z } from "zod";
import type { Guideline, Idea, Job, MemoryItem, Post, Reference } from "@ama/shared";
import { NotConfiguredError } from "./errors";
import { logOpenAiRunCost } from "./openai-cost";

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

/**
 * Tool parameter schemas must be OpenAI strict-JSON friendly:
 * prefer `.nullable()` over `.optional()` / `.default()`.
 */
const ideationIdeaSchema = z.object({
  title: z.string(),
  summary: z.string(),
  pillar: z.string(),
  topicKey: z.string(),
  hook: z.string(),
  angle: z.string(),
  referenceIds: z.array(z.string()),
  jobId: z.string().nullable(),
  rationale: z.string(),
  score: z.number().nullable()
});

const submitIdeasSchema = z.object({
  summary: z.string(),
  reasoning: z.array(z.string()),
  ideas: z.array(ideationIdeaSchema)
});

/** Empty tool args — avoid bare `{}` (strict JSON schema quirks). */
const emptyArgsSchema = z.object({
  confirm: z.boolean().nullable()
});

function normalizeTopicKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 80);
}

function addBlockedKey(keys: Set<string>, value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return;
  keys.add(trimmed);
  const normalized = normalizeTopicKey(trimmed);
  if (normalized) keys.add(normalized);
}

/** Topic keys and titles already used by memory, posts, or any stored idea. */
export function usedTopicKeys(
  memory: MemoryItem[],
  posts: Post[],
  ideas: Idea[]
): Set<string> {
  const keys = new Set<string>();
  for (const item of memory) {
    if (item.kind === "topic_used" || item.kind === "idea_rejected" || item.kind === "hook_used") {
      addBlockedKey(keys, item.topicKey);
    }
  }
  for (const post of posts) {
    addBlockedKey(keys, post.title);
  }
  for (const idea of ideas) {
    addBlockedKey(keys, idea.topicKey);
    addBlockedKey(keys, idea.title);
  }
  return keys;
}

export function withoutDuplicateIdeas<T extends { topicKey: string; title: string }>(
  candidates: readonly T[],
  blocked: Set<string>
): { kept: T[]; skipped: string[] } {
  const seen = new Set(blocked);
  const kept: T[] = [];
  const skipped: string[] = [];
  for (const idea of candidates) {
    const keys = [idea.topicKey, normalizeTopicKey(idea.topicKey), normalizeTopicKey(idea.title)];
    if (keys.some((key) => key && seen.has(key))) {
      skipped.push(idea.title);
      continue;
    }
    for (const key of keys) addBlockedKey(seen, key);
    kept.push(idea);
  }
  return { kept, skipped };
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

/**
 * OpenAI Agents SDK ideation — tools are Backend-owned (architecture_v1).
 * Final ideas are submitted via `submit_ideas` tool (more reliable than outputType
 * after multi-tool turns, which often hit "Invalid output type" schema mismatches).
 */
export class OpenAIIdeationAgent implements IdeationAgent {
  mode: "openai" = "openai";
  constructor(private apiKey?: string) {}

  async run(input: IdeationRunInput, tools: IdeationToolContext): Promise<IdeationRunOutput> {
    if (!this.apiKey) {
      throw new NotConfiguredError("OpenAI Agents");
    }
    setDefaultOpenAIKey(this.apiKey);

    const accountId = input.accountId;
    const [memory, posts, existingIdeas] = await Promise.all([
      tools.getMemory(accountId),
      tools.getPreviousPosts(accountId, 50),
      tools.listQueuedIdeas(accountId)
    ]);
    const blocked = usedTopicKeys(memory, posts, existingIdeas);
    type SubmittedPayload = z.infer<typeof submitIdeasSchema>;
    const submission: { value: SubmittedPayload | null } = { value: null };
    let rejection: string | null = null;

    const get_guideline = tool({
      name: "get_guideline",
      description: "Load the active human-authored guideline for this Instagram account.",
      parameters: emptyArgsSchema,
      execute: async () => {
        const guideline = await tools.getGuideline(accountId);
        if (!guideline) throw new Error("No active guideline");
        return guideline;
      }
    });

    const list_references = tool({
      name: "list_references",
      description:
        "List human-uploaded reference patterns (slide/hook/voice/docs). Structure only — inspired-by, never copy brand assets.",
      parameters: z.object({
        kind: z
          .enum(["slide_pattern", "hook_pattern", "voice_sample", "doc", "url_note"])
          .nullable()
      }),
      execute: async ({ kind }) => {
        const refs = await tools.listReferences(accountId);
        return kind ? refs.filter((r) => r.kind === kind) : refs;
      }
    });

    const get_memory = tool({
      name: "get_memory",
      description:
        "Load memory items used for dedupe and learning (topic_used, idea_rejected, preferences).",
      parameters: emptyArgsSchema,
      execute: async () => tools.getMemory(accountId)
    });

    const get_previous_posts = tool({
      name: "get_previous_posts",
      description: "Recent posts for this account to avoid repeating topics.",
      parameters: z.object({
        limit: z.number().int().positive().max(50).nullable()
      }),
      execute: async ({ limit }) => {
        const posts = await tools.getPreviousPosts(accountId, limit ?? 20);
        return posts.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          createdAt: p.createdAt
        }));
      }
    });

    const get_candidate_jobs = tool({
      name: "get_candidate_jobs",
      description:
        "Optional job listings. Usually empty; only use for job_pick ideas when guideline.jobPickEnabled is true.",
      parameters: emptyArgsSchema,
      execute: async () => tools.getCandidateJobs()
    });

    const check_duplicate = tool({
      name: "check_duplicate",
      description:
        "Check whether a topicKey or title matches any stored idea, post, or memory item. Call this for every candidate before submit_ideas.",
      parameters: z.object({
        topicKey: z.string(),
        title: z.string()
      }),
      execute: async ({ topicKey, title }) => {
        const [memory, posts, queued] = await Promise.all([
          tools.getMemory(accountId),
          tools.getPreviousPosts(accountId, 30),
          tools.listQueuedIdeas(accountId)
        ]);
        const blocked = usedTopicKeys(memory, posts, queued);
        const normalized = normalizeTopicKey(topicKey || title);
        const duplicate =
          blocked.has(normalized) ||
          blocked.has(normalizeTopicKey(title)) ||
          blocked.has(topicKey);
        return { duplicate, normalizedTopicKey: normalized };
      }
    });

    const submit_ideas = tool({
      name: "submit_ideas",
      description:
        "Submit the final ideation result. Rejects topic keys or titles that already exist. If this returns ok: false, replace the rejected ideas and call it again.",
      parameters: submitIdeasSchema,
      execute: async (payload) => {
        const parsed = submitIdeasSchema.safeParse(payload);
        if (!parsed.success) {
          rejection = parsed.error.message;
          return {
            ok: false,
            error: parsed.error.message,
            hint: "Provide summary (string), reasoning (string[]), ideas (array of objects with title, summary, pillar, topicKey, hook, angle, referenceIds[], jobId null|string, rationale, score null|number)."
          };
        }
        const normalized = parsed.data.ideas.map((idea) => ({
          ...idea,
          title: idea.title.trim(),
          topicKey: (idea.topicKey || "").trim() || normalizeTopicKey(idea.title)
        }));
        const { kept, skipped } = withoutDuplicateIdeas(normalized, blocked);
        if (skipped.length > 0 || kept.length < input.count) {
          rejection = `Duplicates rejected: ${skipped.join(" / ") || "not enough unique ideas"}`;
          return {
            ok: false,
            accepted: 0,
            requiredCount: input.count,
            duplicateTitles: skipped,
            message:
              "These ideas match an existing topic key or title. Replace only the duplicates with new topics, then call submit_ideas again with the full set."
          };
        }
        submission.value = { ...parsed.data, ideas: kept };
        rejection = null;
        return {
          ok: true,
          accepted: kept.length,
          message: "Ideas accepted. Stop after this tool."
        };
      }
    });

    const agent = new Agent({
      name: "Instagram Ideation Agent",
      // Idea drafts are high-volume. Final slide copy stays on gpt-4.1 in the creation agent.
      model: "gpt-4.1-mini",
      instructions: `You are the ideation agent for a Japanese Instagram career/job-change media account.

Architecture rules:
- You ONLY access data through tools (never invent guideline/reference/memory).
- Humans own guideline and references; you read them.
- Memory, previous posts, and every stored idea (queued, selected, used, or rejected) are for dedupe. Never repeat a topicKey or title.
- Content style is inspired-by わかる転職 genre (structure/hooks), never copy brand text or characters.
- Prefer knowhow carousel ideas. Jobs are optional; ignore jobs unless guideline.jobPickEnabled and candidates exist.
- topicKey must be stable ascii keys with dots (e.g. prep.before_quit.three_steps). If unsure, derive from title.
- Titles/summaries/hooks in Japanese unless guideline says otherwise.
- Respect NG rules in the guideline.
- jobId must be null when no job is attached. referenceIds may be [].

Required workflow:
1) Call get_guideline, list_references, get_memory, get_previous_posts.
2) Optionally get_candidate_jobs. Call check_duplicate for each candidate topicKey and title.
3) Call submit_ideas with exactly the requested number of ideas. If it returns ok: false, replace the rejected ideas and call submit_ideas again. Do not finish until it returns ok: true.
4) Do not answer in free text — submit_ideas is your final output.`,
      tools: [
        get_guideline,
        list_references,
        get_memory,
        get_previous_posts,
        get_candidate_jobs,
        check_duplicate,
        submit_ideas
      ],
      toolUseBehavior: () =>
        submission.value
          ? {
              isFinalOutput: true,
              isInterrupted: undefined,
              finalOutput: submission.value.summary
            }
          : { isFinalOutput: false, isInterrupted: undefined }
    });

    const userMessage = [
      `accountId: ${accountId}`,
      `Generate exactly ${input.count} Instagram carousel ideas.`,
      `Then call submit_ideas with exactly ${input.count} ideas.`,
      input.seedText ? `Operator seed text:\n${input.seedText}` : "No seed text.",
      input.seedUrl ? `Optional seed URL: ${input.seedUrl}` : "No seed URL.",
      blocked.size > 0
        ? `Already used topic keys and titles. Do not submit any of these:\n${[...blocked].slice(0, 120).join("\n")}`
        : "No existing topics to avoid."
    ].join("\n\n");

    try {
      const result = await run(agent, userMessage, { maxTurns: 20 });
      logOpenAiRunCost("ideation", agent.model, result);
    } catch (error) {
      logOpenAiRunCost("ideation", agent.model, error);
      // If the model still produced a tool payload we captured, prefer that over a hard fail.
      if (!submission.value) {
        throw new Error(rejection ?? (error instanceof Error ? error.message : "Ideation agent failed"));
      }
    }

    const submitted = submission.value;
    if (!submitted) {
      throw new Error(
        rejection ?? "Ideation agent finished without a duplicate-free submit_ideas result. Retry the request."
      );
    }

    const ideas: IdeationCandidate[] = submitted.ideas.slice(0, input.count).map((idea, index) => ({
      accountId,
      title: idea.title.trim(),
      summary: idea.summary.trim(),
      pillar: idea.pillar.trim() || "転職準備",
      topicKey: (idea.topicKey || "").trim() || normalizeTopicKey(idea.title),
      hook: idea.hook ?? "",
      angle: idea.angle ?? "",
      referenceIds: idea.referenceIds ?? [],
      jobId: idea.jobId ?? null,
      status: "queued" as const,
      agentRunId: null,
      score: idea.score ?? 1 - index * 0.05,
      rationale: idea.rationale?.trim() || "Generated by OpenAI Agents"
    }));

    const { kept, skipped } = withoutDuplicateIdeas(ideas, blocked);
    if (kept.length === 0) {
      throw new Error("No new ideas could be generated (all candidates duplicate existing topics)");
    }

    return {
      summary: submitted.summary,
      ideas: kept,
      reasoning: [
        ...submitted.reasoning,
        "mode=openai-agents",
        "via=submit_ideas",
        skipped.length > 0 ? `Dropped duplicates: ${skipped.join(" / ")}` : "No duplicates dropped"
      ]
    };
  }
}

/** Always use live OpenAI Agents API. MockIdeationAgent remains for tests only. */
export function createIdeationAgent(options: { openAiApiKey?: string }): IdeationAgent {
  return new OpenAIIdeationAgent(options.openAiApiKey);
}
