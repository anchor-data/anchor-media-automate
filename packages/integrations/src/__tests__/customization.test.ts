import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESIGN_RULES,
  buildGenerationConfig,
  checkCustomization,
  deckExtrasFrom,
  designRulesSchema,
  diffSlides,
  isCustomizationEmpty,
  postCustomizationSchema,
  slidesJsonWith,
  slideFieldsSchema,
  type PostCustomization
} from "@ama/shared";

const empty = postCustomizationSchema.parse({});

function custom(patch: Partial<PostCustomization>): PostCustomization {
  return postCustomizationSchema.parse({ ...empty, ...patch });
}

function slides(overrides: Record<string, string> = {}) {
  const base = Object.fromEntries(Object.keys(slideFieldsSchema.shape).map((name) => [name, "あ"]));
  return slideFieldsSchema.parse({ ...base, ...overrides });
}

describe("postCustomizationSchema", () => {
  it("defaults to an empty customization", () => {
    expect(empty).toEqual({
      highlightKeywords: [],
      graph: { enabled: false, page: null },
      evidence: { enabled: false, page: null },
      imageMode: "auto",
      variationSeed: null,
      notes: ""
    });
    expect(isCustomizationEmpty(empty)).toBe(true);
  });

  it("drops the page when the toggle is off", () => {
    const parsed = postCustomizationSchema.parse({ graph: { enabled: false, page: 4 } });
    expect(parsed.graph.page).toBeNull();
  });

  it("rejects pages outside 1-8", () => {
    expect(postCustomizationSchema.safeParse({ graph: { enabled: true, page: 9 } }).success).toBe(false);
    expect(postCustomizationSchema.safeParse({ evidence: { enabled: true, page: 0 } }).success).toBe(false);
  });

  it("rejects graph and evidence on the same page", () => {
    const result = postCustomizationSchema.safeParse({
      graph: { enabled: true, page: 4 },
      evidence: { enabled: true, page: 4 }
    });
    expect(result.success).toBe(false);
  });

  it("requires image mode auto when a graph is requested", () => {
    expect(postCustomizationSchema.safeParse({ graph: { enabled: true, page: 4 }, imageMode: "none" }).success).toBe(false);
    expect(postCustomizationSchema.safeParse({ graph: { enabled: true, page: 4 }, imageMode: "asset_only" }).success).toBe(false);
    expect(postCustomizationSchema.safeParse({ graph: { enabled: true, page: 4 } }).success).toBe(true);
  });

  it("trims and dedupes keywords", () => {
    const parsed = postCustomizationSchema.parse({ highlightKeywords: [" 年収 ", "年収", ""] });
    expect(parsed.highlightKeywords).toEqual(["年収"]);
  });
});

describe("designRulesSchema", () => {
  it("provides defaults", () => {
    expect(designRulesSchema.parse({})).toEqual(DEFAULT_DESIGN_RULES);
  });
});

describe("buildGenerationConfig", () => {
  it("separates global rules from per-post instructions", () => {
    const config = buildGenerationConfig(DEFAULT_DESIGN_RULES, custom({ highlightKeywords: ["年収"], notes: "数字を強調" }));
    expect(config.global).toEqual(DEFAULT_DESIGN_RULES);
    expect(config.post.highlightKeywords).toEqual(["年収"]);
    expect(config.post.notes).toBe("数字を強調");
  });

  it("derives per-page requirements", () => {
    const config = buildGenerationConfig(
      DEFAULT_DESIGN_RULES,
      custom({ graph: { enabled: true, page: 4 }, evidence: { enabled: true, page: 5 } })
    );
    expect(config.requirements).toEqual([
      expect.stringContaining("4"),
      expect.stringContaining("5")
    ]);
  });
});

describe("checkCustomization", () => {
  const deck = (extra: Record<string, unknown> = {}) => ({
    slides: slides({ s3_body: "年収が上がる" }),
    images: [],
    imagePrompts: [],
    ...extra
  });

  it("checks highlight keywords appear in the slides", () => {
    const checks = checkCustomization(deck(), custom({ highlightKeywords: ["年収", "副業"] }));
    expect(checks.map((c) => c.ok)).toEqual([true, false]);
  });

  it("checks the graph lands on the requested page", () => {
    const withGraph = deck({ imagePrompts: [{ slot: "s4_image", scene: "bar chart" }] });
    const wrongPage = deck({ imagePrompts: [{ slot: "s2_image", scene: "bar chart" }] });
    const c = custom({ graph: { enabled: true, page: 4 } });
    expect(checkCustomization(withGraph, c).every((x) => x.ok)).toBe(true);
    expect(checkCustomization(wrongPage, c).some((x) => !x.ok)).toBe(true);
  });

  it("accepts a graph on any page when no page is pinned", () => {
    const c = custom({ graph: { enabled: true, page: null } });
    expect(checkCustomization(deck({ imagePrompts: [{ slot: "s6_image", scene: "x" }] }), c).every((x) => x.ok)).toBe(true);
    expect(checkCustomization(deck(), c).some((x) => !x.ok)).toBe(true);
  });

  it("enforces image mode none and asset_only", () => {
    const withAsset = deck({ images: [{ slot: "s1_image", assetId: "a" }] });
    const withPrompt = deck({ imagePrompts: [{ slot: "s2_image", scene: "x" }] });
    expect(checkCustomization(withAsset, custom({ imageMode: "none" })).some((x) => !x.ok)).toBe(true);
    expect(checkCustomization(withPrompt, custom({ imageMode: "asset_only" })).some((x) => !x.ok)).toBe(true);
    expect(checkCustomization(withAsset, custom({ imageMode: "asset_only" })).every((x) => x.ok)).toBe(true);
    expect(checkCustomization(deck(), custom({ imageMode: "none" })).every((x) => x.ok)).toBe(true);
  });

  it("returns nothing for an empty customization", () => {
    expect(checkCustomization(deck(), empty)).toEqual([]);
  });
});

describe("diffSlides", () => {
  it("lists only changed fields", () => {
    const before = slides();
    const after = slides({ s3_head: "変更", s8_cta: "保存" });
    expect(diffSlides(before, after)).toEqual([
      { field: "s3_head", before: "あ", after: "変更" },
      { field: "s8_cta", before: "あ", after: "保存" }
    ]);
  });

  it("is empty for identical slides", () => {
    expect(diffSlides(slides(), slides())).toEqual([]);
  });
});

describe("slides_json extras", () => {
  it("round-trips images, customization and report next to the text fields", () => {
    const c = custom({ highlightKeywords: ["年収"] });
    const json = slidesJsonWith(slides(), {
      images: [{ slot: "s1_image", assetId: "a" }],
      customization: c,
      report: { at: "2026-01-01T00:00:00Z", diff: [], checks: [] }
    });
    const extras = deckExtrasFrom(json);
    expect(extras.images).toEqual([{ slot: "s1_image", assetId: "a" }]);
    expect(extras.customization).toEqual(c);
    expect(extras.report?.at).toBe("2026-01-01T00:00:00Z");
    expect(slideFieldsSchema.safeParse(json).success).toBe(true);
  });

  it("reads defaults from legacy or missing slides_json", () => {
    expect(deckExtrasFrom(null).customization).toEqual(empty);
    expect(deckExtrasFrom({ s1_title: "x" }).images).toEqual([]);
    expect(deckExtrasFrom({ customization: { graph: "bad" } }).customization).toEqual(empty);
  });
});

import { pickTemplateVariant, templateVariantSchema, type TemplateVariant } from "@ama/shared";

const variant = (id: string): TemplateVariant => ({ id, name: `variant ${id}`, description: "" });
const variants = [variant("A"), variant("B"), variant("C")];

describe("pickTemplateVariant", () => {
  it("returns null without variants", () => {
    expect(pickTemplateVariant([], [], () => 0)).toBeNull();
  });

  it("returns the only variant", () => {
    expect(pickTemplateVariant([variant("A")], ["A", "A"], () => 0.9)?.id).toBe("A");
  });

  it("prefers a variant that was never used", () => {
    expect(pickTemplateVariant(variants, ["A", "B"], () => 0)?.id).toBe("C");
  });

  it("picks the least recently used when all were used (recent ids are newest first)", () => {
    expect(pickTemplateVariant(variants, ["A", "B", "C"], () => 0)?.id).toBe("C");
    expect(pickTemplateVariant(variants, ["C", "B", "A"], () => 0)?.id).toBe("A");
  });

  it("never repeats the most recent one when there is a choice", () => {
    for (const roll of [0, 0.34, 0.67, 0.99]) {
      expect(pickTemplateVariant(variants, ["B"], () => roll)?.id).not.toBe("B");
    }
  });

  it("breaks ties with the random source", () => {
    const picks = new Set([0, 0.99].map((roll) => pickTemplateVariant(variants, [], () => roll)?.id));
    expect(picks.size).toBe(2);
  });

  it("ignores recent ids that are no longer registered", () => {
    expect(pickTemplateVariant(variants, ["gone", "A"], () => 0)?.id).not.toBe("A");
  });
});

describe("templateVariantSchema and slides_json", () => {
  it("requires an id and a name", () => {
    expect(templateVariantSchema.safeParse({ id: "EAHZ", name: "A", description: "x" }).success).toBe(true);
    expect(templateVariantSchema.safeParse({ id: "", name: "A" }).success).toBe(false);
  });

  it("round-trips the chosen template id", () => {
    const json = slidesJsonWith(slides(), { images: [], customization: empty, templateId: "EAHZ" });
    expect(deckExtrasFrom(json).templateId).toBe("EAHZ");
    expect(deckExtrasFrom(null).templateId).toBeNull();
  });
});

import { templateCandidates, resolveTemplateId } from "@ama/shared";

describe("templateCandidates / resolveTemplateId", () => {
  const base = "BASE";
  it("puts the base template first, then the registered variants", () => {
    expect(templateCandidates(base, variants).map((v) => v.id)).toEqual(["BASE", "A", "B", "C"]);
    expect(templateCandidates(base, undefined).map((v) => v.id)).toEqual(["BASE"]);
  });

  it("does not list the base template twice", () => {
    expect(templateCandidates(base, [variant("BASE"), variant("A")]).map((v) => v.id)).toEqual(["BASE", "A"]);
  });

  it("uses the stored template only while it is still registered", () => {
    expect(resolveTemplateId(base, variants, "B")).toBe("B");
    expect(resolveTemplateId(base, variants, "gone")).toBe("BASE");
    expect(resolveTemplateId(base, variants, null)).toBe("BASE");
    expect(resolveTemplateId(base, variants, "BASE")).toBe("BASE");
  });
});
