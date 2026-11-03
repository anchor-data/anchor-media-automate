import { describe, expect, it, vi } from "vitest";
import { requestDesignFromReferences, buildReferencePrompt } from "../design";
import { DEFAULT_DESIGN_SPEC } from "../spec";

const reply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 9000, completion_tokens: 900 } }));

describe("buildReferencePrompt", () => {
  it("includes the guideline and the allowed fields", () => {
    const prompt = buildReferencePrompt({ guideline: "清潔感のある青系。見出しは太く", referenceNote: "@wakaru_tenshoku" });
    expect(prompt).toContain("清潔感のある青系");
    expect(prompt).toContain("@wakaru_tenshoku");
    expect(prompt).toContain("accentAlternates");
    expect(prompt).toContain("variety");
    expect(prompt).toContain("structure");
  });

  it("copes with no guideline", () => {
    expect(buildReferencePrompt({})).toContain("reference");
  });
});

describe("requestDesignFromReferences", () => {
  it("sends every screenshot as an image and returns a readable spec", async () => {
    const fetchImpl = vi.fn(async () =>
      reply('{"summary":"navy and yellow, bold","theme":{"primary":"#123a7a","accent":"#ffcc33","accentAlternates":["#ff7a59"],"ink":"#fafafa","card":"#ffffff"},"layout":{"variety":"lively"}}')
    );
    const result = await requestDesignFromReferences({
      apiKey: "k",
      images: ["data:image/png;base64,AAAA", "https://example.com/b.png"],
      guideline: "青系",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as {
      messages: Array<{ content: Array<{ type: string }> }>;
    };
    expect(body.messages[0]!.content.filter((part) => part.type === "image_url")).toHaveLength(2);
    expect(result.summary).toBe("navy and yellow, bold");
    expect(result.usage).toEqual({ model: "gpt-4.1", inputTokens: 9000, outputTokens: 900 });
    expect(result.spec.theme.primary).toBe("#123a7a");
    expect(result.spec.theme.accentAlternates).toEqual(["#ff7a59"]);
    expect(result.spec.layout.variety).toBe("lively");
    // near-white ink on a white card was swapped by the guardrail
    expect(result.spec.theme.ink).not.toBe("#fafafa");
  });

  it("falls back to the default look for fields it cannot use", async () => {
    const fetchImpl = vi.fn(async () => reply('{"theme":{"primary":"blue"}}'));
    const { spec } = await requestDesignFromReferences({ apiKey: "k", images: ["data:image/png;base64,AA"], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(spec.theme.primary).toBe(DEFAULT_DESIGN_SPEC.theme.primary);
  });

  it("needs at least one image or a guideline", async () => {
    await expect(requestDesignFromReferences({ apiKey: "k", images: [] })).rejects.toThrow(/screenshot|guideline/i);
  });

  it("requires an API key and surfaces API errors", async () => {
    await expect(requestDesignFromReferences({ images: ["x"], guideline: "g" })).rejects.toThrow(/OpenAI/);
    const fetchImpl = vi.fn(async () => new Response("no", { status: 429 }));
    await expect(
      requestDesignFromReferences({ apiKey: "k", images: ["x"], fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow(/429/);
  });
});
