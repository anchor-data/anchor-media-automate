import { describe, expect, it, vi } from "vitest";
import { requestDesignFromReferences, buildReferencePrompt, referenceLabel } from "../design";
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

  it("makes the references the primary source and the guideline a supplement", () => {
    const prompt = buildReferencePrompt({ guideline: "青系" });
    expect(prompt).toContain("primary source");
    expect(prompt).toContain("follow the references");
    expect(prompt).not.toContain("takes priority over the references");
  });

  it("asks for an eye-catching, creative design that copies the references' arrangement, legibility and frame", () => {
    const prompt = buildReferencePrompt({});
    expect(prompt).toContain("stops people mid-scroll");
    expect(prompt).toContain("creative and eye-catching");
    expect(prompt).toContain("how the elements are arranged");
    expect(prompt).toContain("how legible they are");
    expect(prompt).toContain("frame and panel treatment");
    expect(prompt).toContain("Creativity never comes before legibility");
  });

  it("asks for per-role overrides only where pages clearly differ", () => {
    const prompt = buildReferencePrompt({});
    expect(prompt).toContain('"roles"');
    expect(prompt).toContain("typically the cover and the closing page");
    expect(prompt).toContain("do not put it in a role");
  });

  it("copes with no guideline", () => {
    expect(buildReferencePrompt({})).toContain("reference");
  });
});

describe("referenceLabel", () => {
  it("names the page and its role when the page is known", () => {
    expect(referenceLabel(0, 1, ["cover", "point", "cta"])).toBe("Reference image 1 - page 1 of the carousel (cover)");
    expect(referenceLabel(2, 3, ["cover", "point", "cta"])).toBe("Reference image 3 - page 3 of the carousel (cta)");
  });

  it("is just the number when no page is given", () => {
    expect(referenceLabel(1, null)).toBe("Reference image 2");
    expect(referenceLabel(1, 0)).toBe("Reference image 2");
  });
});

describe("measured colors in the prompt", () => {
  it("adds the measured palette to the image label", () => {
    expect(referenceLabel(0, 1, ["cover", "point", "cta"], "#1d4a43 62%, #f3e8c4 14%")).toContain("#1d4a43 62%, #f3e8c4 14%");
    expect(referenceLabel(0, null, undefined, "")).toBe("Reference image 1");
  });

  it("sends each screenshot's palette with its image", async () => {
    const fetchImpl = vi.fn(async () => reply('{"summary":"x"}'));
    await requestDesignFromReferences({ apiKey: "k", images: ["https://example.com/a.png"], pages: [1], palettes: ["#1d4a43 62%"], structure: ["cover", "point", "cta"], fetchImpl: fetchImpl as unknown as typeof fetch });
    const body = String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).toContain("#1d4a43 62%");
  });
});

describe("requestDesignFromReferences", () => {
  it("returns the model's per-role overrides next to the base design", async () => {
    const fetchImpl = vi.fn(async () =>
      reply('{"summary":"s","theme":{"card":"#f4f6fb"},"roles":{"cover":{"theme":{"card":"#1f4d45","ink":"#ffffff"},"layout":{"decor":"none"}}}}')
    );
    const result = await requestDesignFromReferences({ apiKey: "k", images: ["https://example.com/a.png"], pages: [1], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.spec.roles.cover?.theme).toEqual({ card: "#1f4d45", ink: "#ffffff" });
    expect(result.spec.theme.card).toBe("#f4f6fb");
  });

  it("labels each screenshot with its page before the image", async () => {
    const fetchImpl = vi.fn(async () => reply('{"summary":"x"}'));
    await requestDesignFromReferences({
      apiKey: "k",
      images: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"],
      pages: [1, null],
      structure: ["cover", "point", "cta"],
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>;
    };
    const parts = body.messages[0]!.content.slice(1);
    expect(parts.map((part) => part.type)).toEqual(["text", "image_url", "text", "image_url"]);
    expect(parts[0]!.text).toContain("page 1 of the carousel (cover)");
    expect(parts[2]!.text).toBe("Reference image 2");
  });

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
