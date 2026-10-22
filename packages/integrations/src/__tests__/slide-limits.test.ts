import { SLIDE_FIELD_LIMITS, slideFieldsSchema } from "@ama/shared";
import { describe, expect, it } from "vitest";
import { REQUIRED_TEMPLATE_FIELDS } from "../canva";

/**
 * Text capacity of each box in the published "wakaru carousel template" (Japanese, one char per
 * em). A deck that respects these limits does not overflow its box after Canva autofill.
 */
const TEMPLATE_CAPACITY: Record<string, number> = {
  s1_title: 20,
  s1_sub: 11,
  s2_head: 6,
  s2_body: 33,
  s3_num: 1,
  s3_head: 4,
  s3_body: 42,
  s4_num: 1,
  s4_head: 5,
  s4_body: 40,
  s5_num: 1,
  s5_head: 6,
  s5_body: 45,
  s6_num: 1,
  s6_head: 5,
  s6_body: 40,
  s7_label: 4,
  s7_head: 5,
  s7_body: 36,
  s8_head: 8,
  s8_cta: 7
};

describe("slide field limits", () => {
  it("defines a limit for every required template field and nothing else", () => {
    expect(Object.keys(SLIDE_FIELD_LIMITS).sort()).toEqual([...REQUIRED_TEMPLATE_FIELDS].sort());
  });

  it("matches what fits in the template's text boxes", () => {
    expect(SLIDE_FIELD_LIMITS).toEqual(TEMPLATE_CAPACITY);
  });

  it("is what the schema enforces", () => {
    const atLimit = Object.fromEntries(Object.entries(SLIDE_FIELD_LIMITS).map(([name, max]) => [name, "あ".repeat(max)]));
    expect(slideFieldsSchema.safeParse(atLimit).success).toBe(true);
    for (const [name, max] of Object.entries(SLIDE_FIELD_LIMITS)) {
      const over = { ...atLimit, [name]: "あ".repeat(max + 1) };
      expect(slideFieldsSchema.safeParse(over).success, name).toBe(false);
    }
  });
});
