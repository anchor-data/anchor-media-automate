/**
 * Local binding so this file typechecks without @types/node.
 * Wrangler replaces the `process.env.NODE_ENV` expression at bundle time:
 * "development" for `wrangler dev`, "production" for deploy.
 */
declare const process: { env: { NODE_ENV?: string } };

/** Standard (non-batch) USD per 1M tokens. https://developers.openai.com/api/docs/pricing */
const MODEL_RATES = [
  { id: "gpt-4.1-nano", input: 0.1, cachedInput: 0.025, output: 0.4 },
  { id: "gpt-4.1-mini", input: 0.4, cachedInput: 0.1, output: 1.6 },
  { id: "gpt-4.1", input: 2, cachedInput: 0.5, output: 8 }
] as const;

/** Cost of one chat-completions call from its token usage; null for an unknown model or no usage. */
export function chatCostUsd(model: string, usage: { inputTokens: number; outputTokens: number } | undefined): number | null {
  const rate = pickRate(MODEL_RATES, model);
  if (!rate || !usage) return null;
  return (usage.inputTokens * rate.input + usage.outputTokens * rate.output) / 1_000_000;
}

type TokenDetails = Record<string, number>;

type RequestUsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  inputTokensDetails?: TokenDetails | TokenDetails[];
};

type UsageLike = {
  requests?: number;
  inputTokens?: number;
  outputTokens?: number;
  inputTokensDetails?: TokenDetails | TokenDetails[];
  requestUsageEntries?: RequestUsageLike[];
};

export type OpenAiCostEstimate = {
  model: string;
  usd: number | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  requests: number;
};

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

function resolveModel(model: unknown): string {
  return typeof model === "string" && model.trim() ? model.trim() : "unknown";
}

function isUsage(value: unknown): value is UsageLike {
  return typeof value === "object" && value !== null && "inputTokens" in value;
}

function readUsage(outcome: unknown): UsageLike | undefined {
  if (!outcome || typeof outcome !== "object") return undefined;
  if ("state" in outcome) {
    const usage = (outcome as { state?: { usage?: unknown } }).state?.usage;
    if (isUsage(usage)) return usage;
  }
  return isUsage(outcome) ? outcome : undefined;
}

function cachedTokens(details: unknown): number {
  if (!details || typeof details !== "object") return 0;
  if (Array.isArray(details)) return details.reduce((sum, item) => sum + cachedTokens(item), 0);
  const record = details as Record<string, unknown>;
  const value = record.cached_tokens ?? record.cachedTokens;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type TokenTotals = Pick<OpenAiCostEstimate, "inputTokens" | "cachedInputTokens" | "outputTokens" | "requests">;

function tally(usage: UsageLike): TokenTotals {
  const entries = usage.requestUsageEntries;
  if (entries && entries.length > 0) {
    return entries.reduce<TokenTotals>(
      (sum, entry) => ({
        inputTokens: sum.inputTokens + (entry.inputTokens ?? 0),
        cachedInputTokens: sum.cachedInputTokens + cachedTokens(entry.inputTokensDetails),
        outputTokens: sum.outputTokens + (entry.outputTokens ?? 0),
        requests: sum.requests + 1
      }),
      { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, requests: 0 }
    );
  }
  return {
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: cachedTokens(usage.inputTokensDetails),
    outputTokens: usage.outputTokens ?? 0,
    requests: usage.requests ?? 0
  };
}

/** The rate entry for a model: an exact id, else the longest id it extends (`gpt-4.1-mini-2025-04-14` -> `gpt-4.1-mini`). */
function pickRate<T extends { id: string }>(rates: readonly T[], model: string): T | undefined {
  return (
    rates.find((rate) => rate.id === model) ??
    [...rates].sort((a, b) => b.id.length - a.id.length).find((rate) => model.startsWith(`${rate.id}-`))
  );
}

function ratesFor(model: string) {
  return pickRate(MODEL_RATES, model);
}

/** Cached input is a subset of input tokens and is billed at the cached rate. */
export function estimateOpenAiCost(model: unknown, outcome: unknown): OpenAiCostEstimate | null {
  const usage = readUsage(outcome);
  if (!usage) return null;
  const counts = tally(usage);
  const resolved = resolveModel(model);
  const rates = ratesFor(resolved);
  const cached = Math.min(Math.max(counts.cachedInputTokens, 0), Math.max(counts.inputTokens, 0));
  const uncached = Math.max(counts.inputTokens, 0) - cached;
  const output = Math.max(counts.outputTokens, 0);
  const usd = rates
    ? (uncached * rates.input + cached * rates.cachedInput + output * rates.output) / 1_000_000
    : null;
  return { model: resolved, usd, ...counts, cachedInputTokens: cached, outputTokens: output };
}

/** Dev-only cost line for one agent run (every model turn in that run). Silent in production and tests. */
export function logOpenAiRunCost(label: string, model: unknown, outcome: unknown): void {
  if (!isDevelopment()) return;
  const estimate = estimateOpenAiCost(model, outcome);
  if (!estimate) {
    console.log(`[openai] ${label} ${resolveModel(model)} price unavailable (no usage reported)`);
    return;
  }
  const price = estimate.usd === null ? "price=unknown" : `$${estimate.usd.toFixed(6)}`;
  console.log(
    `[openai] ${label} ${estimate.model} ${price} input=${estimate.inputTokens} cached=${estimate.cachedInputTokens} output=${estimate.outputTokens} requests=${estimate.requests}`
  );
}

/**
 * USD per 1M tokens for the image models (text input / image input / image output): gpt-image-1 $5 / $10 / $40,
 * gpt-image-1-mini $2 / $2.5 / $8, gpt-image-1.5 $5 / $8 / $32.
 * https://developers.openai.com/api/docs/pricing
 */
const IMAGE_MODEL_RATES = [
  { id: "gpt-image-1", textInput: 5, imageInput: 10, output: 40 },
  { id: "gpt-image-1-mini", textInput: 2, imageInput: 2.5, output: 8 },
  { id: "gpt-image-1.5", textInput: 5, imageInput: 8, output: 32 }
] as const;

/** Token usage as OpenAI's images endpoints report it. */
export type OpenAiImageUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
};

export type OpenAiImageCostEstimate = {
  model: string;
  usd: number | null;
  textInputTokens: number;
  imageInputTokens: number;
  outputTokens: number;
};

export function estimateOpenAiImageCost(model: unknown, usage: OpenAiImageUsage | undefined): OpenAiImageCostEstimate | null {
  if (!usage) return null;
  const resolved = resolveModel(model);
  const input = Math.max(usage.input_tokens ?? 0, 0);
  const imageInput = Math.min(Math.max(usage.input_tokens_details?.image_tokens ?? 0, 0), input);
  const textInput = usage.input_tokens_details?.text_tokens ?? input - imageInput;
  const output = Math.max(usage.output_tokens ?? 0, 0);
  const rates = pickRate(IMAGE_MODEL_RATES, resolved);
  const usd = rates
    ? (textInput * rates.textInput + imageInput * rates.imageInput + output * rates.output) / 1_000_000
    : null;
  return { model: resolved, usd, textInputTokens: textInput, imageInputTokens: imageInput, outputTokens: output };
}

/** Dev-only cost line for one generated image. Silent in production and tests. */
export function logOpenAiImageCost(label: string, model: unknown, usage: OpenAiImageUsage | undefined): void {
  if (!isDevelopment()) return;
  const estimate = estimateOpenAiImageCost(model, usage);
  if (!estimate) {
    console.log(`[openai] ${label} ${resolveModel(model)} price unavailable (no usage reported)`);
    return;
  }
  const price = estimate.usd === null ? "price=unknown" : `$${estimate.usd.toFixed(6)}`;
  console.log(
    `[openai] ${label} ${estimate.model} ${price} text_in=${estimate.textInputTokens} image_in=${estimate.imageInputTokens} output=${estimate.outputTokens}`
  );
}

/** Dev-only total for all images generated for one post. */
export function logOpenAiImageBatchCost(label: string, costs: ReadonlyArray<number | null>): void {
  if (!isDevelopment()) return;
  const known = costs.filter((cost): cost is number => cost !== null);
  const total = known.reduce((sum, cost) => sum + cost, 0);
  const unknown = costs.length - known.length;
  console.log(
    `[openai] ${label} total $${total.toFixed(6)} for ${costs.length} image(s)${unknown > 0 ? ` (${unknown} without usage)` : ""}`
  );
}
