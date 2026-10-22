import { describe, expect, it, vi } from "vitest";
import { REQUIRED_TEMPLATE_FIELDS } from "../canva";
import {
  DEFAULT_TEMPLATE_STRUCTURE,
  inferTemplateStructure,
  parseTemplateStructure,
  structureFieldNames
} from "../template-structure";

const IMAGE = "data:image/png;base64,AAAA";

const completion = (content: unknown, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status });

describe("DEFAULT_TEMPLATE_STRUCTURE", () => {
  it("is the 8-page, 21-field contract", () => {
    expect(DEFAULT_TEMPLATE_STRUCTURE.pages).toHaveLength(8);
    expect([...structureFieldNames(DEFAULT_TEMPLATE_STRUCTURE)].sort()).toEqual([...REQUIRED_TEMPLATE_FIELDS].sort());
  });
});

describe("parseTemplateStructure", () => {
  it("rejects structures with no pages or more than 10", () => {
    expect(() => parseTemplateStructure({ pages: [] })).toThrow();
    const page = { title: "P", purpose: "p", fields: [{ name: "s1_head", maxChars: 10 }] };
    expect(() => parseTemplateStructure({ pages: Array.from({ length: 11 }, () => page) })).toThrow();
  });

  it("rejects duplicate field names", () => {
    const page = { title: "P", purpose: "p", fields: [{ name: "s1_head", maxChars: 10 }] };
    expect(() => parseTemplateStructure({ pages: [page, page] })).toThrow(/duplicate/i);
  });

  it("rejects unsafe field names", () => {
    const page = { title: "P", purpose: "p", fields: [{ name: "S1 Head!", maxChars: 10 }] };
    expect(() => parseTemplateStructure({ pages: [page] })).toThrow();
  });
});

describe("inferTemplateStructure", () => {
  it("falls back to the default structure without an api key or screenshots", async () => {
    expect(await inferTemplateStructure({ screenshots: [IMAGE] })).toEqual(DEFAULT_TEMPLATE_STRUCTURE);
    expect(await inferTemplateStructure({ screenshots: [], apiKey: "k" })).toEqual(DEFAULT_TEMPLATE_STRUCTURE);
  });

  it("builds field names from page number and kind, and sends the screenshots", async () => {
    const fetchImpl = vi.fn(async () =>
      completion({
        pages: [
          { title: "Cover", purpose: "Hook", fields: [{ kind: "title", maxChars: 20 }, { kind: "sub", maxChars: 24 }] },
          { title: "Point", purpose: "Tip", fields: [{ kind: "num", maxChars: 2 }, { kind: "head", maxChars: 16 }] },
          { title: "CTA", purpose: "Follow", fields: [{ kind: "cta", maxChars: 24 }] }
        ]
      })
    );
    const structure = await inferTemplateStructure({
      screenshots: [IMAGE, IMAGE],
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    expect(structure.pages).toHaveLength(3);
    expect(structureFieldNames(structure)).toEqual(["s1_title", "s1_sub", "s2_num", "s2_head", "s3_cta"]);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    const body = JSON.parse(String(init.body)) as { messages: Array<{ content: unknown }> };
    expect(JSON.stringify(body.messages)).toContain(IMAGE);
  });

  it("throws when OpenAI fails or returns an unusable structure", async () => {
    const failing = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(
      inferTemplateStructure({ screenshots: [IMAGE], apiKey: "k", fetchImpl: failing as unknown as typeof fetch })
    ).rejects.toThrow(/500/);

    const empty = vi.fn(async () => completion({ pages: [] }));
    await expect(
      inferTemplateStructure({ screenshots: [IMAGE], apiKey: "k", fetchImpl: empty as unknown as typeof fetch })
    ).rejects.toThrow();
  });
});
