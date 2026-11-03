import { describe, expect, it } from "vitest";
import { accountDesignSchema, addCost, deckExtrasFrom, totalCost, slideFieldsSchema, slidesJsonWith } from "@ama/shared";

function slides(overrides: Record<string, string> = {}) {
  const base = Object.fromEntries(Object.keys(slideFieldsSchema.shape).map((name) => [name, "あ"]));
  return slideFieldsSchema.parse({ ...base, ...overrides });
}

describe("slides_json extras", () => {
  it("round-trips images, the post's design and its prompt next to the text fields", () => {
    const design = { theme: { accent: "#ff7a59" } };
    const json = slidesJsonWith(slides(), {
      images: [{ slot: "s1_image", assetId: "a" }],
      design,
      designPrompt: "もっと落ち着いた雰囲気で",
      costUsd: { copy: 0.0412, images: 0.08, design: 0.0101 }
    });
    const extras = deckExtrasFrom(json);
    expect(extras.images).toEqual([{ slot: "s1_image", assetId: "a" }]);
    expect(extras.design).toEqual(design);
    expect(extras.designPrompt).toBe("もっと落ち着いた雰囲気で");
    expect(extras.costUsd).toEqual({ copy: 0.0412, images: 0.08, design: 0.0101 });
    expect(slideFieldsSchema.safeParse(json).success).toBe(true);
  });

  it("reads defaults from missing, legacy or malformed slides_json", () => {
    const empty = { images: [], design: null, designPrompt: "", costUsd: { copy: 0, images: 0, design: 0 } };
    expect(deckExtrasFrom(null)).toEqual(empty);
    expect(deckExtrasFrom({ s1_title: "x" }).images).toEqual([]);
    expect(deckExtrasFrom({ design: "bad", designPrompt: 3, costUsd: { copy: "x" } })).toEqual(empty);
  });

  it("omits an empty design from the stored json", () => {
    const json = slidesJsonWith(slides(), { images: [], design: null, designPrompt: "", costUsd: { copy: 0, images: 0, design: 0 } });
    expect("design" in json).toBe(false);
    expect("designPrompt" in json).toBe(false);
  });
});

describe("addCosts", () => {
  it("adds to the matching bucket without mutating", () => {
    const before = { copy: 0.01, images: 0, design: 0 };
    const after = addCost(before, "design", 0.0123);
    expect(after).toEqual({ copy: 0.01, images: 0, design: 0.0123 });
    expect(before.design).toBe(0);
  });

  it("ignores null and negative amounts, and totals", () => {
    expect(addCost({ copy: 0, images: 0, design: 0 }, "copy", null)).toEqual({ copy: 0, images: 0, design: 0 });
    expect(totalCost({ copy: 0.01, images: 0.02, design: 0.003 })).toBeCloseTo(0.033, 6);
  });
});

describe("accountDesignSchema", () => {
  it("defaults to an empty design", () => {
    expect(accountDesignSchema.parse({})).toEqual({ spec: null, guideline: "", referenceNote: "", summary: "", updatedAt: null, analysisCostUsd: 0 });
  });

  it("accepts a stored design", () => {
    const parsed = accountDesignSchema.parse({ spec: { theme: {} }, guideline: "青系", referenceNote: "@x", summary: "s", updatedAt: "2026-01-01T00:00:00Z" });
    expect(parsed.guideline).toBe("青系");
    expect(parsed.spec).toEqual({ theme: {} });
  });
});
