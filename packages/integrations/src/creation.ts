import { Agent, run, setDefaultOpenAIKey, tool } from "@openai/agents";
import { z } from "zod";
import { SLIDE_FIELD_LIMITS, slideDeckSchema, slideFieldsSchema } from "@ama/shared";
import type { Guideline, Idea, ImageAsset, Job, PostType, Reference, SlideDeck, SlideFields } from "@ama/shared";
import { NotConfiguredError } from "./errors";
import { logOpenAiRunCost } from "./openai-cost";

export type CreationToolContext = {
  getIdea: (ideaId: string) => Promise<Idea | null>;
  getGuideline: (accountId: string) => Promise<Guideline | null>;
  listReferences: (accountId: string) => Promise<Reference[]>;
  getJob: (jobId: string) => Promise<Job | null>;
  /** Human-uploaded images the agent may place into slides. Omitted: no image tool. */
  listImageAssets?: (accountId: string) => Promise<ImageAsset[]>;
  /** The account's fixed image rules (subject, style, palette...); AI image generation is on only when it is non-empty. */
  getImageStylePrompt?: (accountId: string) => Promise<string>;
};

export type CreationRunInput = {
  ideaId: string;
  accountId: string;
  /** Operator feedback when regenerating an existing deck. */
  feedback?: string;
  previousDeck?: SlideDeck;
};

export type CreationRunOutput = {
  summary: string;
  deck: SlideDeck;
  reasoning: string[];
};

export interface CreationAgent {
  mode: "mock" | "openai";
  run(input: CreationRunInput, tools: CreationToolContext): Promise<CreationRunOutput>;
}

/** Context a deck is validated against. */
export type DeckContext = {
  idea: Idea;
  guideline: Guideline;
  imageAssets?: readonly ImageAsset[];
  /** True when the account has a style prompt, so imagePrompts may be used. */
  imageGeneration?: boolean;
};

export type DeckValidation =
  | { ok: true; deck: SlideDeck }
  | { ok: false; errors: string[] };

const MAX_SUBMIT_REJECTIONS = 3;

/** Slide 7 rule: job fields only when the idea carries a job AND the guideline allows it. */
export function expectedPostType(idea: Pick<Idea, "jobId">, guideline: Pick<Guideline, "jobPickEnabled">): PostType {
  return idea.jobId && guideline.jobPickEnabled ? "job_pick" : "knowhow";
}

export function deckText(deck: SlideDeck): string {
  return [...Object.values(deck.slides), deck.caption, ...deck.hashtags].join("\n");
}

/** NG rules are free-text policies; flag the ones a human wrote as quoted phrases that appear verbatim. */
export function findNgPhraseViolations(deck: SlideDeck, ngRules: readonly string[]): string[] {
  const text = deckText(deck);
  return ngRules.filter((rule) => rule.trim().length > 0 && text.includes(rule.trim()));
}

/** Pure, shared by every agent implementation and by the API before anything is stored. */
export function validateDeck(raw: unknown, context: DeckContext): DeckValidation {
  const parsed = slideDeckSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "deck"}: ${issue.message}`)
    };
  }
  const deck = parsed.data;
  const errors: string[] = [];

  const wanted = expectedPostType(context.idea, context.guideline);
  if (deck.postType !== wanted) {
    errors.push(
      wanted === "job_pick"
        ? "postType must be job_pick: the idea has a job and the guideline enables job picks"
        : "postType must be knowhow: no job pick is allowed for this idea"
    );
  }
  const known = new Set((context.imageAssets ?? []).map((asset) => asset.id));
  const usedSlots = new Set<string>();
  for (const image of deck.images ?? []) {
    if (!known.has(image.assetId)) errors.push(`Unknown image asset: ${image.assetId} (use ids from list_image_assets)`);
    if (usedSlots.has(image.slot)) errors.push(`Image slot used twice: ${image.slot}`);
    usedSlots.add(image.slot);
  }
  if ((deck.imagePrompts ?? []).length > 0 && !context.imageGeneration) {
    errors.push("imagePrompts: AI image generation is not enabled for this account (no image style prompt); pass []");
  }
  for (const prompt of deck.imagePrompts ?? []) {
    if (usedSlots.has(prompt.slot)) errors.push(`Image slot used twice: ${prompt.slot}`);
    usedSlots.add(prompt.slot);
  }
  for (const rule of findNgPhraseViolations(deck, context.guideline.ngRules)) {
    errors.push(`Deck contains an NG phrase: ${rule}`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, deck };
}

export function slideFieldNames(): Array<keyof SlideFields> {
  return Object.keys(slideFieldsSchema.shape) as Array<keyof SlideFields>;
}

/** Human-readable `field: max N chars` lines for the agent instructions. */
export function describeSlideLimits(): string {
  return slideFieldNames()
    .map((name) => {
      const field = slideFieldsSchema.shape[name] as z.ZodString;
      return `- ${name}: max ${field.maxLength} chars`;
    })
    .join("\n");
}

function clip(value: string, max: number): string {
  const chars = Array.from(value.trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

/** Deterministic deck for local/CI — no OpenAI required. */
export class MockCreationAgent implements CreationAgent {
  mode: "mock" = "mock";

  async run(input: CreationRunInput, tools: CreationToolContext): Promise<CreationRunOutput> {
    const idea = await tools.getIdea(input.ideaId);
    if (!idea) throw new Error(`Idea not found: ${input.ideaId}`);
    const guideline = await tools.getGuideline(idea.accountId);
    if (!guideline) throw new Error(`No active guideline for account ${idea.accountId}`);
    const postType = expectedPostType(idea, guideline);
    const job = postType === "job_pick" && idea.jobId ? await tools.getJob(idea.jobId) : null;

    const L = SLIDE_FIELD_LIMITS;
    const point = (n: number) => `${idea.angle || idea.title}のポイント${n}。${idea.summary}`;

    const slides: SlideFields = {
      s1_title: clip(idea.title, L.s1_title),
      s1_sub: clip(idea.hook || idea.summary, L.s1_sub),
      s2_head: clip("悩んでない?", L.s2_head),
      s2_body: clip(idea.summary, L.s2_body),
      s3_num: "1", s3_head: clip("ポイント1", L.s3_head), s3_body: clip(point(1), L.s3_body),
      s4_num: "2", s4_head: clip("ポイント2", L.s4_head), s4_body: clip(point(2), L.s4_body),
      s5_num: "3", s5_head: clip("ポイント3", L.s5_head), s5_body: clip(point(3), L.s5_body),
      s6_num: "4", s6_head: clip("ポイント4", L.s6_head), s6_body: clip(point(4), L.s6_body),
      s7_label: job ? "求人" : "まとめ",
      s7_head: clip(job ? `${job.company} ${job.role}` : "今日から", L.s7_head),
      s7_body: clip(job ? `${job.location}。詳細は ${job.url}` : "保存して見返そう", L.s7_body),
      s8_head: clip("保存して見返そう", L.s8_head),
      s8_cta: clip("フォローしてね", L.s8_cta)
    };

    const result = validateDeck(
      { postType, slides, caption: `${idea.title}\n\n${idea.summary}`, hashtags: ["#転職", "#転職準備"] },
      { idea, guideline }
    );
    if (!result.ok) throw new Error(`Mock deck failed validation: ${result.errors.join(" / ")}`);
    return {
      summary: `Built ${postType} deck for「${idea.title}」`,
      deck: result.deck,
      reasoning: [`postType=${postType}`, "mode=mock"]
    };
  }
}

/**
 * Strict-JSON-friendly submit schema: plain strings only. Length limits are enforced by
 * validateDeck inside the tool so the model gets actionable errors and can retry.
 */
const submitDeckSchema = z.object({
  summary: z.string(),
  reasoning: z.array(z.string()),
  postType: z.enum(["knowhow", "job_pick"]),
  slides: z.object(
    Object.fromEntries(slideFieldNames().map((name) => [name, z.string()])) as Record<
      keyof SlideFields,
      z.ZodString
    >
  ),
  caption: z.string(),
  hashtags: z.array(z.string()),
  /** Images from list_image_assets placed into slides; empty when none fit. */
  images: z.array(z.object({ slot: z.string(), assetId: z.string() })),
  /** Scene-only prompts for AI-generated slide illustrations; [] when generation is not offered. */
  imagePrompts: z.array(z.object({ slot: z.string(), scene: z.string() }))
});

const getIdeaArgsSchema = z.object({ confirm: z.boolean().nullable() });
const getJobArgsSchema = z.object({ jobId: z.string() });

/** OpenAI Agents SDK creation — tools are Backend-owned; the deck is only accepted via submit_deck. */
export class OpenAICreationAgent implements CreationAgent {
  mode: "openai" = "openai";
  constructor(private apiKey?: string) {}

  async run(input: CreationRunInput, tools: CreationToolContext): Promise<CreationRunOutput> {
    if (!this.apiKey) throw new NotConfiguredError("OpenAI Agents");
    setDefaultOpenAIKey(this.apiKey);

    const idea = await tools.getIdea(input.ideaId);
    if (!idea) throw new Error(`Idea not found: ${input.ideaId}`);
    const guideline = await tools.getGuideline(idea.accountId);
    if (!guideline) throw new Error(`No active guideline for account ${idea.accountId}`);

    const imageAssets = (await tools.listImageAssets?.(idea.accountId)) ?? [];
    const imageGeneration = Boolean((await tools.getImageStylePrompt?.(idea.accountId))?.trim());

    const state: { accepted: CreationRunOutput | null; rejections: number; lastErrors: string[] } = {
      accepted: null,
      rejections: 0,
      lastErrors: []
    };

    const get_idea = tool({
      name: "get_idea",
      description: "Load the idea this carousel must be built from.",
      parameters: getIdeaArgsSchema,
      execute: async () => idea
    });
    const get_guideline = tool({
      name: "get_guideline",
      description: "Load the active human-authored guideline (tone, NG rules, CTA and hashtag policy).",
      parameters: getIdeaArgsSchema,
      execute: async () => guideline
    });
    const list_references = tool({
      name: "list_references",
      description: "List human-uploaded reference patterns. Structure only — never copy brand text or assets.",
      parameters: getIdeaArgsSchema,
      execute: async () => tools.listReferences(idea.accountId)
    });
    const list_image_assets = tool({
      name: "list_image_assets",
      description:
        "List human-uploaded images (id, label, description) that can be placed into slides via submit_deck.images.",
      parameters: getIdeaArgsSchema,
      execute: async () =>
        (await tools.listImageAssets?.(idea.accountId))?.map(({ id, label, description }) => ({ id, label, description })) ?? []
    });
    const get_job = tool({
      name: "get_job",
      description: "Load a job listing. Only for job_pick decks (idea.jobId set and guideline.jobPickEnabled).",
      parameters: getJobArgsSchema,
      execute: async ({ jobId }) => (await tools.getJob(jobId)) ?? { error: "Job not found" }
    });

    const submit_deck = tool({
      name: "submit_deck",
      description:
        "Submit the final 8-slide deck, caption and hashtags. Returns ok:false with errors when validation fails — fix exactly those errors and call it again.",
      parameters: submitDeckSchema,
      execute: async (payload) => {
        const result = validateDeck(
          {
            postType: payload.postType,
            slides: payload.slides,
            caption: payload.caption,
            hashtags: payload.hashtags,
            images: payload.images,
            imagePrompts: payload.imagePrompts
          },
          { idea, guideline, imageAssets, imageGeneration }
        );
        if (!result.ok) {
          state.rejections += 1;
          state.lastErrors = result.errors;
          return { ok: false, errors: result.errors, attemptsLeft: Math.max(0, MAX_SUBMIT_REJECTIONS - state.rejections) };
        }
        state.accepted = { summary: payload.summary, deck: result.deck, reasoning: payload.reasoning };
        return { ok: true, message: "Deck accepted. Stop after this tool." };
      }
    });

    const agent = new Agent({
      name: "Instagram Creation Agent",
      model: "gpt-4.1",
      instructions: `You are the creation agent for a Japanese Instagram career/job-change media account.
You turn ONE selected idea into an 8-slide 4:5 carousel (copy only; Canva renders it).

Rules:
- Access data only through tools. Never invent guideline, reference or job data.
- Content style is inspired-by わかる転職 (structure/hooks); never copy brand text or characters.
- Write in Japanese unless the guideline says otherwise. Respect every NG rule and the CTA/hashtag policy.
- Slide roles: 1 cover/hook, 2 empathy/problem, 3-6 know-how points (num "1".."4"), 7 job pick OR summary, 8 CTA.
- Slide 7: postType job_pick only when the idea has a jobId and guideline.jobPickEnabled; otherwise knowhow with a summary/checklist.
- Never exceed these limits (count characters, not bytes):
${describeSlideLimits()}

Required workflow:
1) get_idea, get_guideline, list_references, list_image_assets (and get_job for job_pick).
2) Call submit_deck. Decide per post whether an uploaded image helps. Place one in submit_deck.images ({slot: "s1_image".."s8_image", assetId}) only when this idea's slide would be clearer or more on-brand with it, following the image description (e.g. a mascot that "explains" suits explanation slides, a logo suits slide 1 or 8). Skip images that add nothing for this idea and pass [] when none are needed. Use each slot at most once; the same asset may appear on several slides. Never invent asset ids.${
        imageGeneration
          ? `
   AI illustrations are available: the account has fixed image rules (subject, style, palette, background), applied automatically. For slides where a custom illustration helps (typically the explanation slides 2-6, at most 5), add submit_deck.imagePrompts entries {slot: "s2_image".."s8_image", scene}. Write ONLY what changes for that slide, in English: the subject's action or arrangement, setting, mood, lighting, composition (e.g. \"a person stands in a dark kitchen at night peeking into an open refrigerator, soft blue-white glow\" or \"overhead desk with a notebook and coffee, warm morning light\"). Do not repeat the fixed rules (who/what the subject looks like, art style, colors), and never ask for text in the image. Each scene must match that slide's message. Use a slot for either an uploaded image or a generated one, not both. Pass [] when illustrations add nothing.`
          : ""
      }
3) If submit_deck returns ok:false, fix exactly the listed errors and call it again.
4) Do not answer in free text — submit_deck is your final output.`,
      tools: [get_idea, get_guideline, list_references, list_image_assets, get_job, submit_deck],
      toolUseBehavior: () =>
        state.accepted || state.rejections >= MAX_SUBMIT_REJECTIONS
          ? { isFinalOutput: true, isInterrupted: undefined, finalOutput: state.accepted?.summary ?? "rejected" }
          : { isFinalOutput: false, isInterrupted: undefined }
    });

    const userMessage = [
      `ideaId: ${idea.id}`,
      "Build the 8-slide deck for this idea, then call submit_deck.",
      input.feedback ? `Operator feedback to apply:\n${input.feedback}` : null,
      input.previousDeck ? `Previous deck (improve, do not repeat verbatim):\n${JSON.stringify(input.previousDeck)}` : null
    ]
      .filter((part): part is string => part !== null)
      .join("\n\n");

    try {
      const result = await run(agent, userMessage, { maxTurns: 20 });
      logOpenAiRunCost("creation", agent.model, result);
    } catch (error) {
      logOpenAiRunCost("creation", agent.model, error);
      if (!state.accepted) {
        throw new Error(error instanceof Error ? error.message : "Creation agent failed");
      }
    }

    if (!state.accepted) {
      throw new Error(
        `Creation agent produced no valid deck after ${state.rejections} rejected attempt(s): ${state.lastErrors.join(" / ") || "no submission"}`
      );
    }
    return { ...state.accepted, reasoning: [...state.accepted.reasoning, "mode=openai-agents", "via=submit_deck"] };
  }
}

/** Always use live OpenAI Agents API. MockCreationAgent remains for tests only. */
export function createCreationAgent(options: { openAiApiKey?: string }): CreationAgent {
  return new OpenAICreationAgent(options.openAiApiKey);
}
