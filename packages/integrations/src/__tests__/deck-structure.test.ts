import { describe, expect, it } from "vitest";
import {
  DEFAULT_STRUCTURE,
  MAX_SLIDES,
  MIN_SLIDES,
  deckStructureSchema,
  describeStructure,
  fieldKeys,
  imageSlotsFor,
  roleOf,
  slideDeckSchemaFor,
  slideFieldsSchemaFor,
  type SlideRole
} from "@ama/shared";

const short: SlideRole[] = ["cover", "point", "point", "point", "cta"];

describe("DEFAULT_STRUCTURE", () => {
  it("is today's 8 pages", () => {
    expect(DEFAULT_STRUCTURE).toEqual(["cover", "empathy", "point", "point", "point", "point", "pick", "cta"]);
  });

  it("has exactly the 21 fields the 8-page deck always had", () => {
    expect(fieldKeys(DEFAULT_STRUCTURE).map((f) => f.key).sort()).toEqual(
      [
        "s1_title", "s1_sub", "s2_head", "s2_body", "s3_num", "s3_head", "s3_body", "s4_num", "s4_head", "s4_body",
        "s5_num", "s5_head", "s5_body", "s6_num", "s6_head", "s6_body", "s7_label", "s7_head", "s7_body", "s8_head", "s8_cta"
      ].sort()
    );
  });
});

describe("deckStructureSchema", () => {
  it("accepts structures of 3 to 10 pages that start with a cover and end with a CTA", () => {
    expect(deckStructureSchema.safeParse(DEFAULT_STRUCTURE).success).toBe(true);
    expect(deckStructureSchema.safeParse(short).success).toBe(true);
    expect(deckStructureSchema.safeParse(["cover", "point", "cta"]).success).toBe(true);
    expect(MIN_SLIDES).toBe(3);
    expect(MAX_SLIDES).toBe(10);
  });

  it("rejects too few or too many pages", () => {
    expect(deckStructureSchema.safeParse(["cover", "cta"]).success).toBe(false);
    const eleven: SlideRole[] = ["cover", ...Array<SlideRole>(9).fill("point"), "cta"];
    expect(deckStructureSchema.safeParse(eleven).success).toBe(false);
  });

  it("requires a cover first, a CTA last and at least one point page", () => {
    expect(deckStructureSchema.safeParse(["point", "point", "cta"]).success).toBe(false);
    expect(deckStructureSchema.safeParse(["cover", "point", "point"]).success).toBe(false);
    expect(deckStructureSchema.safeParse(["cover", "empathy", "cta"]).success).toBe(false);
    expect(deckStructureSchema.safeParse(["cover", "banana", "cta"]).success).toBe(false);
  });
});

describe("fieldKeys and roleOf", () => {
  it("numbers fields by page and names them by role", () => {
    const keys = fieldKeys(short).map((f) => f.key);
    expect(keys).toEqual([
      "s1_title", "s1_sub", "s2_num", "s2_head", "s2_body", "s3_num", "s3_head", "s3_body", "s4_num", "s4_head", "s4_body", "s5_head", "s5_cta"
    ]);
    expect(roleOf(short, 1)).toBe("cover");
    expect(roleOf(short, 5)).toBe("cta");
    expect(roleOf(short, 6)).toBeNull();
  });

  it("lists the image slots, one per page", () => {
    expect(imageSlotsFor(short)).toEqual(["s1_image", "s2_image", "s3_image", "s4_image", "s5_image"]);
  });
});

describe("slideFieldsSchemaFor", () => {
  const fill = (structure: SlideRole[], text = "あ") => Object.fromEntries(fieldKeys(structure).map((f) => [f.key, text]));

  it("requires every field of the structure and nothing from other structures", () => {
    const schema = slideFieldsSchemaFor(short);
    expect(schema.safeParse(fill(short)).success).toBe(true);
    const { s5_cta: _omit, ...missing } = fill(short);
    expect(schema.safeParse(missing).success).toBe(false);
    expect(Object.keys(schema.parse({ ...fill(short), s8_cta: "extra" }))).not.toContain("s8_cta");
  });

  it("enforces the per-role character limits", () => {
    const schema = slideFieldsSchemaFor(short);
    expect(schema.safeParse({ ...fill(short), s1_title: "あ".repeat(21) }).success).toBe(false);
    expect(schema.safeParse({ ...fill(short), s1_title: "あ".repeat(20) }).success).toBe(true);
    expect(schema.safeParse({ ...fill(short), s5_cta: "あ".repeat(8) }).success).toBe(false);
  });
});

describe("slideDeckSchemaFor", () => {
  it("validates a whole deck against the structure", () => {
    const slides = Object.fromEntries(fieldKeys(short).map((f) => [f.key, "あ"]));
    const deck = { postType: "knowhow", slides, caption: "c", hashtags: [] };
    expect(slideDeckSchemaFor(short).safeParse(deck).success).toBe(true);
    expect(slideDeckSchemaFor(DEFAULT_STRUCTURE).safeParse(deck).success).toBe(false);
  });

  it("limits image slots to the pages that exist", () => {
    const slides = Object.fromEntries(fieldKeys(short).map((f) => [f.key, "あ"]));
    const base = { postType: "knowhow", slides, caption: "c", hashtags: [] };
    expect(slideDeckSchemaFor(short).safeParse({ ...base, images: [{ slot: "s5_image", assetId: "a" }] }).success).toBe(true);
    expect(slideDeckSchemaFor(short).safeParse({ ...base, images: [{ slot: "s6_image", assetId: "a" }] }).success).toBe(false);
  });
});

describe("describeStructure", () => {
  it("describes each page with its role and fields, for the agent", () => {
    const text = describeStructure(short);
    expect(text).toContain("1: cover");
    expect(text).toContain("s1_title");
    expect(text).toContain("5: cta");
    expect(text.split("\n")).toHaveLength(5);
  });
});
