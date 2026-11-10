import { describe, expect, it } from "vitest";
import { applySpecPatch, contrastRatio, designSpecSchema, DEFAULT_DESIGN_SPEC, ensureReadable, specForRole } from "../spec";

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

describe("ensureReadable surface", () => {
  const dark = { bg: "#edeef2", card: "#38697c", ink: "#ffffff", primary: "#ffffff", onAccent: "#111111", accent: "#d05c4e", bar: "#bbc7db", onBar: "#212530" };

  it("keeps light text on a dark card even though the page background is light", () => {
    const spec = ensureReadable(applySpecPatch(DEFAULT_DESIGN_SPEC, { theme: dark, layout: { frame: "filled" } }));
    expect(spec.theme.ink).toBe("#ffffff");
    expect(spec.theme.primary).toBe("#ffffff");
  });

  it("fixes dark text on that card (older saved designs)", () => {
    const spec = ensureReadable(applySpecPatch(DEFAULT_DESIGN_SPEC, { theme: { ...dark, ink: "#111111", primary: "#212530" } }));
    expect(spec.theme.ink).toBe("#ffffff");
    expect(spec.theme.primary).toBe("#ffffff");
  });

  it("judges against the page background when there is no frame", () => {
    const spec = ensureReadable(applySpecPatch(DEFAULT_DESIGN_SPEC, { theme: { ...dark, ink: "#111111" }, layout: { frame: "none" } }));
    expect(spec.theme.ink).toBe("#111111");
  });
});

describe("per-role design", () => {
  const withCover = applySpecPatch(DEFAULT_DESIGN_SPEC, {
    roles: {
      cover: { theme: { card: "#1f4d45", ink: "#ffffff", primary: "#ffe27a" }, layout: { decor: "none", frame: "filled" } },
      bogus: { theme: { card: "#000000" } }
    }
  });

  it("keeps only valid roles and fields from a model's patch", () => {
    expect(Object.keys(withCover.roles)).toEqual(["cover"]);
    expect(withCover.roles.cover?.theme).toEqual({ card: "#1f4d45", ink: "#ffffff", primary: "#ffe27a" });
    const bad = applySpecPatch(DEFAULT_DESIGN_SPEC, { roles: { cta: { theme: { card: "not-a-color", ink: "#fff" }, layout: { radius: 999, decor: "dots" } } } });
    expect(bad.roles.cta).toEqual({ theme: { ink: "#fff" }, layout: { decor: "dots" } });
  });

  it("does not let a role change the accent", () => {
    const spec = applySpecPatch(DEFAULT_DESIGN_SPEC, { roles: { cover: { theme: { accent: "#123456" } } } });
    expect(spec.roles.cover).toBeUndefined();
  });

  it("draws a role with its overrides and leaves the others alone", () => {
    expect(specForRole(withCover, "cover").theme.card).toBe("#1f4d45");
    expect(specForRole(withCover, "cover").layout.decor).toBe("none");
    expect(specForRole(withCover, "point")).toBe(withCover);
    expect(specForRole(withCover, null)).toBe(withCover);
  });

  it("re-checks readability for the role's own colors", () => {
    const dark = applySpecPatch(DEFAULT_DESIGN_SPEC, { roles: { cover: { theme: { card: "#101820", ink: "#111111", primary: "#222222" }, layout: { frame: "filled" } } } });
    const cover = specForRole(dark, "cover");
    expect(contrastRatio(cover.theme.ink, "#101820")).toBeGreaterThanOrEqual(4.5);
    expect(cover.theme.ink).toBe("#ffffff");
  });

  it("is stored and read back (older designs have no roles)", () => {
    expect(designSpecSchema.parse(withCover).roles.cover?.layout?.decor).toBe("none");
    expect(designSpecSchema.parse({}).roles).toEqual({});
  });
});
