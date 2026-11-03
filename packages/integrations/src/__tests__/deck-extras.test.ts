import { describe, expect, it } from "vitest";
import { accountDesignSchema, deckExtrasFrom, slideFieldsSchema, slidesJsonWith } from "@ama/shared";

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
      designPrompt: "もっと落ち着いた雰囲気で"
    });
    const extras = deckExtrasFrom(json);
    expect(extras.images).toEqual([{ slot: "s1_image", assetId: "a" }]);
    expect(extras.design).toEqual(design);
    expect(extras.designPrompt).toBe("もっと落ち着いた雰囲気で");
    expect(slideFieldsSchema.safeParse(json).success).toBe(true);
  });

  it("reads defaults from missing, legacy or malformed slides_json", () => {
    expect(deckExtrasFrom(null)).toEqual({ images: [], design: null, designPrompt: "" });
    expect(deckExtrasFrom({ s1_title: "x" }).images).toEqual([]);
    expect(deckExtrasFrom({ design: "bad", designPrompt: 3 })).toEqual({ images: [], design: null, designPrompt: "" });
  });

  it("omits an empty design from the stored json", () => {
    const json = slidesJsonWith(slides(), { images: [], design: null, designPrompt: "" });
    expect("design" in json).toBe(false);
    expect("designPrompt" in json).toBe(false);
  });
});

describe("accountDesignSchema", () => {
  it("defaults to an empty design", () => {
    expect(accountDesignSchema.parse({})).toEqual({ spec: null, guideline: "", referenceNote: "", summary: "", updatedAt: null });
  });

  it("accepts a stored design", () => {
    const parsed = accountDesignSchema.parse({ spec: { theme: {} }, guideline: "青系", referenceNote: "@x", summary: "s", updatedAt: "2026-01-01T00:00:00Z" });
    expect(parsed.guideline).toBe("青系");
    expect(parsed.spec).toEqual({ theme: {} });
  });
});
