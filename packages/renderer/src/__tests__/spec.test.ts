import { describe, expect, it } from "vitest";
import { applySpecPatch, contrastRatio, designSpecSchema, DEFAULT_DESIGN_SPEC, ensureReadable } from "../spec";

describe("designSpecSchema", () => {
  it("fills defaults from an empty object", () => {
    expect(designSpecSchema.parse({})).toEqual(DEFAULT_DESIGN_SPEC);
  });

  it("rejects colors that are not hex", () => {
    expect(designSpecSchema.safeParse({ theme: { primary: "blue" } }).success).toBe(false);
  });

  it("rejects out-of-range type scales and weights", () => {
    expect(designSpecSchema.safeParse({ type: { headScale: 2 } }).success).toBe(false);
    expect(designSpecSchema.safeParse({ type: { headWeight: 1000 } }).success).toBe(false);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("accepts 3-digit hex", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 0);
  });
});

describe("applySpecPatch", () => {
  it("merges nested patches without touching other fields", () => {
    const next = applySpecPatch(DEFAULT_DESIGN_SPEC, { theme: { accent: "#ff8800" }, layout: { numberAlign: "left" } });
    expect(next.theme.accent).toBe("#ff8800");
    expect(next.theme.primary).toBe(DEFAULT_DESIGN_SPEC.theme.primary);
    expect(next.layout.numberAlign).toBe("left");
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(DEFAULT_DESIGN_SPEC);
    applySpecPatch(DEFAULT_DESIGN_SPEC, { theme: { accent: "#ff8800" } });
    expect(JSON.stringify(DEFAULT_DESIGN_SPEC)).toBe(before);
  });

  it("drops invalid patch fields and keeps the rest", () => {
    const next = applySpecPatch(DEFAULT_DESIGN_SPEC, { theme: { accent: "orange", primary: "#112233" }, type: { headScale: 9 } });
    expect(next.theme.accent).toBe(DEFAULT_DESIGN_SPEC.theme.accent);
    expect(next.theme.primary).toBe("#112233");
    expect(next.type.headScale).toBe(DEFAULT_DESIGN_SPEC.type.headScale);
  });
});

describe("ensureReadable", () => {
  it("leaves readable specs alone", () => {
    expect(ensureReadable(DEFAULT_DESIGN_SPEC)).toEqual(DEFAULT_DESIGN_SPEC);
  });

  it("fixes ink that is unreadable on its surface", () => {
    const bad = applySpecPatch(DEFAULT_DESIGN_SPEC, { theme: { card: "#ffffff", ink: "#f5f5f5" } });
    const fixed = ensureReadable(bad);
    expect(contrastRatio(fixed.theme.ink, fixed.theme.card)).toBeGreaterThanOrEqual(4.5);
  });

  it("fixes the heading color on the accent pill", () => {
    const bad = applySpecPatch(DEFAULT_DESIGN_SPEC, { theme: { accent: "#0a2a66", primary: "#0b2c53" } });
    const fixed = ensureReadable(bad);
    expect(contrastRatio(fixed.theme.onAccent, fixed.theme.accent)).toBeGreaterThanOrEqual(4.5);
  });
});
