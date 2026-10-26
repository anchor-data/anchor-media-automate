import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateOpenAiCost, logOpenAiRunCost } from "../openai-cost";

const million = {
  inputTokens: 1_000_000,
  outputTokens: 0,
  requests: 1,
  inputTokensDetails: [{ cached_tokens: 0 }]
};

describe("estimateOpenAiCost", () => {
  it("prices gpt-4.1 input, cached input, and output at published rates", () => {
    expect(estimateOpenAiCost("gpt-4.1", million)?.usd).toBe(2);
    expect(
      estimateOpenAiCost("gpt-4.1", {
        inputTokens: 1_000_000,
        outputTokens: 0,
        inputTokensDetails: [{ cached_tokens: 1_000_000 }]
      })?.usd
    ).toBe(0.5);
    expect(estimateOpenAiCost("gpt-4.1", { inputTokens: 0, outputTokens: 1_000_000 })?.usd).toBe(8);
  });

  it("bills cached tokens once, at the cached rate", () => {
    const estimate = estimateOpenAiCost("gpt-4.1", {
      inputTokens: 1_000,
      outputTokens: 500,
      inputTokensDetails: [{ cached_tokens: 200 }]
    });
    expect(estimate?.usd).toBeCloseTo((800 * 2 + 200 * 0.5 + 500 * 8) / 1_000_000, 10);
  });

  it("sums per-request usage and matches dated gpt-4.1 snapshots", () => {
    const estimate = estimateOpenAiCost("gpt-4.1-2025-04-14", {
      state: {
        usage: {
          inputTokens: 999,
          outputTokens: 999,
          requests: 9,
          requestUsageEntries: [
            { inputTokens: 100, outputTokens: 10, inputTokensDetails: { cached_tokens: 40 } },
            { inputTokens: 50, outputTokens: 5, inputTokensDetails: { cached_tokens: 0 } }
          ]
        }
      }
    });
    expect(estimate).toMatchObject({
      model: "gpt-4.1-2025-04-14",
      inputTokens: 150,
      cachedInputTokens: 40,
      outputTokens: 15,
      requests: 2
    });
    expect(estimate?.usd).toBeCloseTo((110 * 2 + 40 * 0.5 + 15 * 8) / 1_000_000, 10);
  });

  it("does not apply gpt-4.1 rates to gpt-4.1-mini", () => {
    expect(estimateOpenAiCost("gpt-4.1-mini", million)?.usd).toBe(0.4);
  });

  it("returns a null price for an unknown model and null when usage is missing", () => {
    expect(estimateOpenAiCost("gpt-unknown", million)?.usd).toBeNull();
    expect(estimateOpenAiCost("gpt-4.1", { state: {} })).toBeNull();
  });
});

describe("logOpenAiRunCost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays silent outside development", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logOpenAiRunCost("ideation", "gpt-4.1", million);
    expect(spy).not.toHaveBeenCalled();
  });

  it("prints the estimated price in development", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      logOpenAiRunCost("creation", "gpt-4.1", million);
    } finally {
      process.env.NODE_ENV = previous;
    }
    expect(spy).toHaveBeenCalledWith(
      "[openai] creation gpt-4.1 $2.000000 input=1000000 cached=0 output=0 requests=1"
    );
  });
});

describe("estimateOpenAiImageCost", () => {
  it("prices gpt-image-1 text input, image input and image output tokens", async () => {
    const { estimateOpenAiImageCost } = await import("../openai-cost");
    const estimate = estimateOpenAiImageCost("gpt-image-1", {
      input_tokens: 1_500,
      input_tokens_details: { text_tokens: 500, image_tokens: 1_000 },
      output_tokens: 1_056
    });
    expect(estimate?.usd).toBeCloseTo((500 * 5 + 1_000 * 10 + 1_056 * 40) / 1_000_000, 10);
    expect(estimate).toMatchObject({ textInputTokens: 500, imageInputTokens: 1_000, outputTokens: 1_056 });
  });

  it("treats all input as text when no breakdown is given, and returns null price for unknown models", async () => {
    const { estimateOpenAiImageCost } = await import("../openai-cost");
    expect(estimateOpenAiImageCost("gpt-image-1", { input_tokens: 1_000, output_tokens: 0 })?.usd).toBeCloseTo(0.005, 10);
    expect(estimateOpenAiImageCost("some-new-model", { input_tokens: 1, output_tokens: 1 })?.usd).toBeNull();
  });

  it("returns null when the response has no usage", async () => {
    const { estimateOpenAiImageCost } = await import("../openai-cost");
    expect(estimateOpenAiImageCost("gpt-image-1", undefined)).toBeNull();
  });
});

describe("logOpenAiImageCost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs a priced line in development and stays silent otherwise", async () => {
    const { logOpenAiImageCost } = await import("../openai-cost");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const usage = { input_tokens: 100, output_tokens: 1_056 };
    logOpenAiImageCost("image s2_image", "gpt-image-1", usage);
    expect(log).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "development");
    logOpenAiImageCost("image s2_image", "gpt-image-1", usage);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[openai] image s2_image gpt-image-1 $"));
  });
});
