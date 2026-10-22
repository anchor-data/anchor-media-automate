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

function ratesFor(model: string) {
  return MODEL_RATES.find((rate) => model === rate.id || model.startsWith(`${rate.id}-`));
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
