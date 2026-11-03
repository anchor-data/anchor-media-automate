import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STRUCTURE, deckStructureSchema } from "@ama/shared";
import { buildStructurePrompt, normalizeStructure, requestStructureFromReferences } from "../structure";

describe("normalizeStructure", () => {
  it("keeps a valid structure as is", () => {
    expect(normalizeStructure(["cover", "empathy", "point", "point", "cta"])).toEqual(["cover", "empathy", "point", "point", "cta"]);
  });

  it("forces a cover first and a CTA last", () => {
    expect(normalizeStructure(["point", "point", "point"])).toEqual(["cover", "point", "point", "point", "cta"]);
    expect(normalizeStructure(["cover", "point", "point"]).at(-1)).toBe("cta");
    expect(normalizeStructure(["empathy", "point", "cta"])[0]).toBe("cover");
  });

  it("moves covers and CTAs that are not at the ends out of the middle", () => {
    const result = normalizeStructure(["cover", "point", "cover", "cta", "point", "cta"]);
    expect(result[0]).toBe("cover");
    expect(result.at(-1)).toBe("cta");
    expect(result.slice(1, -1)).not.toContain("cover");
    expect(result.slice(1, -1)).not.toContain("cta");
  });

  it("ensures at least one point page", () => {
    expect(normalizeStructure(["cover", "empathy", "cta"])).toContain("point");
  });

  it("clamps to 3-10 pages, dropping surplus middle pages", () => {
    const long = ["cover", ...Array<"point">(14).fill("point"), "cta"] as const;
    const result = normalizeStructure([...long]);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe("cover");
    expect(result.at(-1)).toBe("cta");
    expect(normalizeStructure([])).toEqual(["cover", "point", "cta"]);
  });

  it("drops unknown roles and always yields a valid structure", () => {
    for (const input of [[], ["banana"], ["cover"], ["cta", "cover"], Array(30).fill("empathy"), ["pick", "pick", "pick"]]) {
      expect(deckStructureSchema.safeParse(normalizeStructure(input as string[])).success, JSON.stringify(input)).toBe(true);
    }
  });
});

describe("buildStructurePrompt", () => {
  it("explains the roles and the limits", () => {
    const prompt = buildStructurePrompt();
    for (const role of ["cover", "empathy", "point", "pick", "cta"]) expect(prompt).toContain(role);
    expect(prompt).toContain("3");
    expect(prompt).toContain("10");
  });
});

describe("requestStructureFromReferences", () => {
  const reply = (content: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 5000, completion_tokens: 200 } }));

  it("sends every screenshot and returns a normalized structure with a summary and usage", async () => {
    const fetchImpl = vi.fn(async () => reply('{"summary":"7枚: 共感から要点4つ","pages":["cover","empathy","point","point","point","point","cta"]}'));
    const result = await requestStructureFromReferences({
      apiKey: "k",
      images: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"],
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { messages: Array<{ content: Array<{ type: string }> }> };
    expect(body.messages[0]!.content.filter((p) => p.type === "image_url")).toHaveLength(2);
    expect(result.structure).toHaveLength(7);
    expect(result.summary).toContain("7枚");
    expect(result.usage).toEqual({ model: "gpt-4.1", inputTokens: 5000, outputTokens: 200 });
  });

  it("falls back to the default structure when the reply has no usable pages", async () => {
    const fetchImpl = vi.fn(async () => reply("{}"));
    const result = await requestStructureFromReferences({ apiKey: "k", images: ["data:image/png;base64,AA"], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.structure).toEqual(DEFAULT_STRUCTURE);
  });

  it("needs a screenshot and an API key, and surfaces API errors", async () => {
    await expect(requestStructureFromReferences({ apiKey: "k", images: [] })).rejects.toThrow(/screenshot/i);
    await expect(requestStructureFromReferences({ images: ["x"] })).rejects.toThrow(/OpenAI/);
    const fetchImpl = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(requestStructureFromReferences({ apiKey: "k", images: ["x"], fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(/500/);
  });
});
