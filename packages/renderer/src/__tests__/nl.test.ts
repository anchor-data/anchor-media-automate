import { describe, expect, it, vi } from "vitest";
import { buildSpecPrompt, parseSpecPatch, requestSpecPatch } from "../nl";
import { DEFAULT_DESIGN_SPEC } from "../spec";

describe("parseSpecPatch", () => {
  it("parses plain JSON", () => {
    expect(parseSpecPatch('{"theme":{"accent":"#fff"}}')).toEqual({ theme: { accent: "#fff" } });
  });

  it("strips code fences and surrounding prose", () => {
    expect(parseSpecPatch('Here you go:\n```json\n{"layout":{"decor":"none"}}\n```')).toEqual({ layout: { decor: "none" } });
  });

  it("returns an empty patch for garbage", () => {
    expect(parseSpecPatch("no json here")).toEqual({});
    expect(parseSpecPatch("[1,2]")).toEqual({});
  });
});

describe("buildSpecPrompt", () => {
  it("includes the request, the current spec and the allowed values", () => {
    const prompt = buildSpecPrompt("落ち着いた緑系で", DEFAULT_DESIGN_SPEC);
    expect(prompt).toContain("落ち着いた緑系で");
    expect(prompt).toContain(DEFAULT_DESIGN_SPEC.theme.accent);
    expect(prompt).toContain("numberAlign");
    expect(prompt).toContain("headWeight");
    expect(prompt).toContain("structure");
  });
});

describe("requestSpecPatch", () => {
  it("applies the model's patch on top of the current spec and keeps it readable", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"theme":{"ink":"#f8f8f8","card":"#ffffff","accent":"#2f9e6e"},"layout":{"numberAlign":"left"}}' } }],
          usage: { prompt_tokens: 3000, completion_tokens: 500 }
        })
      )
    );
    const { spec, patch, usage } = await requestSpecPatch({ apiKey: "k", request: "緑系、番号は左", current: DEFAULT_DESIGN_SPEC, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(patch.layout).toEqual({ numberAlign: "left" });
    expect(usage).toEqual({ model: "gpt-4.1", inputTokens: 3000, outputTokens: 500 });
    expect(spec.theme.accent).toBe("#2f9e6e");
    expect(spec.layout.numberAlign).toBe("left");
    // The model asked for near-white ink on white: the guardrail replaced it.
    expect(spec.theme.ink).not.toBe("#f8f8f8");
  });

  it("throws when the call fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    await expect(
      requestSpecPatch({ apiKey: "k", request: "x", current: DEFAULT_DESIGN_SPEC, fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow(/500/);
  });

  it("requires an API key", async () => {
    await expect(requestSpecPatch({ request: "x", current: DEFAULT_DESIGN_SPEC })).rejects.toThrow(/OpenAI/);
  });
});
