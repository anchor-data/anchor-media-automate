import { describe, expect, it } from "vitest";
import { REQUIRED_TEMPLATE_FIELDS } from "../canva";
import { buildTemplateBrief, parseInstagramHandle } from "../template-brief";
import { parseTemplateStructure } from "../template-structure";

describe("parseInstagramHandle", () => {
  it("reads the handle from a profile url, with or without query", () => {
    expect(parseInstagramHandle("https://www.instagram.com/wakaru_tensyoku?stkn=abc")).toBe("wakaru_tensyoku");
    expect(parseInstagramHandle("instagram.com/wakaru_tensyoku/")).toBe("wakaru_tensyoku");
  });

  it("accepts a bare @handle", () => {
    expect(parseInstagramHandle("@wakaru_tensyoku")).toBe("wakaru_tensyoku");
  });

  it("rejects non-instagram hosts and post urls", () => {
    expect(parseInstagramHandle("https://example.com/wakaru")).toBeNull();
    expect(parseInstagramHandle("https://www.instagram.com/p/ABC123/")).toBeNull();
    expect(parseInstagramHandle("")).toBeNull();
  });
});

describe("buildTemplateBrief", () => {
  const brief = buildTemplateBrief({
    referenceUrl: "https://www.instagram.com/wakaru_tensyoku",
    assetUrls: ["https://cdn.example.com/logo.png"],
    styleNotes: "deep blue accent"
  });

  it("lists every required autofill field exactly once", () => {
    const names = brief.pages.flatMap((page) => page.fields.map((field) => field.name));
    expect([...names].sort()).toEqual([...REQUIRED_TEMPLATE_FIELDS].sort());
  });

  it("has 8 pages with their character limits", () => {
    expect(brief.pages).toHaveLength(8);
    expect(brief.pages[0]!.fields).toEqual([
      { name: "s1_title", maxChars: 20 },
      { name: "s1_sub", maxChars: 11 }
    ]);
  });

  it("carries the reference, assets and notes into the markdown checklist", () => {
    expect(brief.markdown).toContain("@wakaru_tensyoku");
    expect(brief.markdown).toContain("https://cdn.example.com/logo.png");
    expect(brief.markdown).toContain("deep blue accent");
    expect(brief.markdown).toContain("s8_cta");
  });

  it("reminds about original assets only", () => {
    expect(brief.markdown).toMatch(/original/i);
  });

  it("works with no optional inputs", () => {
    const minimal = buildTemplateBrief({ referenceUrl: "@someone", assetUrls: [], styleNotes: "" });
    expect(minimal.markdown).toContain("@someone");
    expect(minimal.pages).toHaveLength(8);
  });
});

describe("buildTemplateBrief with an inferred structure", () => {
  it("uses the given pages and fields instead of the default 8", () => {
    const structure = parseTemplateStructure({
      pages: [
        { title: "Cover", purpose: "Hook", fields: [{ name: "s1_title", maxChars: 18 }] },
        { title: "CTA", purpose: "Follow", fields: [{ name: "s2_cta", maxChars: 12 }] }
      ]
    });
    const brief = buildTemplateBrief({ referenceUrl: "@x", assetUrls: [], styleNotes: "", structure });
    expect(brief.pages).toHaveLength(2);
    expect(brief.markdown).toContain("`s2_cta` (max 12 chars)");
    expect(brief.markdown).not.toContain("s8_cta");
  });
});
