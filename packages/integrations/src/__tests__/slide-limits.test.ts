import { DEFAULT_STRUCTURE, ROLE_FIELDS, SLIDE_FIELD_LIMITS, fieldKeys, slideFieldsSchema } from "@ama/shared";
import { describe, expect, it } from "vitest";

describe("slide field limits", () => {
  it("defines a limit for every slide field of the default deck and nothing else", () => {
    expect(Object.keys(SLIDE_FIELD_LIMITS).sort()).toEqual(Object.keys(slideFieldsSchema.shape).sort());
  });

  it("gives every page of a role the same capacity", () => {
    for (const { key, role, name } of fieldKeys(DEFAULT_STRUCTURE)) {
      expect(SLIDE_FIELD_LIMITS[key], key).toBe(ROLE_FIELDS[role].find((f) => f.name === name)!.max);
    }
  });

  it("keeps copy short enough for the layouts: no field is longer than its box can hold", () => {
    // headings are one or two lines at ~100px; body copy at most ~4 lines of 19 characters
    for (const { name, max } of fieldKeys(DEFAULT_STRUCTURE)) {
      if (name === "num") expect(max).toBe(1);
      if (name === "body") expect(max).toBeLessThanOrEqual(45);
      if (name === "head" || name === "label" || name === "cta") expect(max).toBeLessThanOrEqual(8);
    }
  });

  it("rejects copy over the limit and accepts copy at the limit", () => {
    const base = Object.fromEntries(Object.keys(SLIDE_FIELD_LIMITS).map((key) => [key, "あ"]));
    expect(slideFieldsSchema.safeParse({ ...base, s1_title: "あ".repeat(20) }).success).toBe(true);
    expect(slideFieldsSchema.safeParse({ ...base, s1_title: "あ".repeat(21) }).success).toBe(false);
  });
});
