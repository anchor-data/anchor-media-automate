import { describe, expect, it } from "vitest";
import { applySpecPatch, contrastRatio, DEFAULT_DESIGN_SPEC, designSpecSchema } from "../spec";
import { varySpec } from "../vary";

const withAlternates = applySpecPatch(DEFAULT_DESIGN_SPEC, {
  theme: { accentAlternates: ["#ff7a59", "#5ec2a1", "#8e7dff"] }
});

describe("varySpec", () => {
  it("is deterministic for a seed", () => {
    expect(varySpec(withAlternates, "post_1")).toEqual(varySpec(withAlternates, "post_1"));
  });

  it("changes something across seeds but stays inside the allowed set", () => {
    const allowed = new Set([withAlternates.theme.accent, ...withAlternates.theme.accentAlternates]);
    const results = Array.from({ length: 24 }, (_, i) => varySpec(withAlternates, `post_${i}`));
    expect(new Set(results.map((spec) => spec.theme.accent)).size).toBeGreaterThan(1);
    for (const spec of results) {
      expect(allowed.has(spec.theme.accent)).toBe(true);
      expect(designSpecSchema.safeParse(spec).success).toBe(true);
    }
  });

  it("keeps text readable on whichever accent it picked", () => {
    for (let i = 0; i < 24; i++) {
      const spec = varySpec(applySpecPatch(withAlternates, { theme: { accentAlternates: ["#0a2a66", "#fff4c2"] } }), `s${i}`);
      expect(contrastRatio(spec.theme.onAccent, spec.theme.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("does nothing when variety is none", () => {
    const fixed = applySpecPatch(withAlternates, { layout: { variety: "none" } });
    for (let i = 0; i < 10; i++) expect(varySpec(fixed, `x${i}`)).toEqual(fixed);
  });

  it("subtle changes only color and number alignment", () => {
    for (let i = 0; i < 24; i++) {
      const spec = varySpec(withAlternates, `y${i}`);
      expect(spec.layout.decor).toBe(withAlternates.layout.decor);
      expect(spec.type.underlineHeads).toBe(withAlternates.type.underlineHeads);
      expect(spec.layout.radius).toBe(withAlternates.layout.radius);
    }
  });

  it("lively may also change underline and decoration", () => {
    const lively = applySpecPatch(withAlternates, { layout: { variety: "lively" } });
    const specs = Array.from({ length: 40 }, (_, i) => varySpec(lively, `z${i}`));
    expect(new Set(specs.map((s) => s.type.underlineHeads)).size).toBe(2);
    expect(new Set(specs.map((s) => s.layout.decor)).size).toBeGreaterThan(1);
  });

  it("lively may also change the structure of the content pages; subtle never does", () => {
    const lively = applySpecPatch(withAlternates, { layout: { variety: "lively" } });
    const structures = new Set(Array.from({ length: 60 }, (_, i) => varySpec(lively, `st${i}`).layout.structure));
    expect(structures.size).toBeGreaterThan(1);
    for (let i = 0; i < 30; i++) expect(varySpec(withAlternates, `sub${i}`).layout.structure).toBe(withAlternates.layout.structure);
  });

  it("varies the background artwork per post, within bounds", () => {
    const specs = Array.from({ length: 40 }, (_, i) => varySpec(withAlternates, `bg${i}`));
    expect(new Set(specs.map((s) => s.layout.bgVariant)).size).toBeGreaterThan(1);
    expect(new Set(specs.map((s) => s.layout.bgFlip)).size).toBe(2);
    for (const s of specs) {
      expect(s.layout.bgOffset).toBeGreaterThanOrEqual(0.3);
      expect(s.layout.bgOffset).toBeLessThanOrEqual(0.7);
    }
  });

  it("lively uses a wider crop range, and varies corner roundness and number size", () => {
    const lively = applySpecPatch(withAlternates, { layout: { variety: "lively" } });
    const specs = Array.from({ length: 60 }, (_, i) => varySpec(lively, `lv${i}`));
    expect(Math.min(...specs.map((s) => s.layout.bgOffset))).toBeLessThan(0.3);
    expect(Math.max(...specs.map((s) => s.layout.bgOffset))).toBeGreaterThan(0.7);
    expect(new Set(specs.map((s) => s.layout.radius)).size).toBeGreaterThan(1);
    expect(new Set(specs.map((s) => s.type.numScale)).size).toBeGreaterThan(1);
    for (const s of specs) expect(designSpecSchema.safeParse(s).success).toBe(true);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(withAlternates);
    varySpec(withAlternates, "m");
    expect(JSON.stringify(withAlternates)).toBe(before);
  });
});

import { resolvePostDesign } from "../vary";

describe("resolvePostDesign", () => {
  const account = { theme: { accent: "#ff0000", accentAlternates: ["#00aa00", "#0000aa"] }, layout: { variety: "subtle" } };

  it("uses the post's stored design when it is valid", () => {
    const stored = { theme: { accent: "#123456" } };
    expect(resolvePostDesign(account, stored, "post_1").theme.accent).toBe("#123456");
  });

  it("derives a varied design from the account design for a new post", () => {
    const spec = resolvePostDesign(account, null, "post_1");
    expect(["#ff0000", "#00aa00", "#0000aa"]).toContain(spec.theme.accent);
    expect(resolvePostDesign(account, null, "post_1")).toEqual(spec);
  });

  it("falls back to the default design when the account has none or it is invalid", () => {
    expect(resolvePostDesign(null, null, "p").theme.primary).toBe(DEFAULT_DESIGN_SPEC.theme.primary);
    expect(resolvePostDesign({ theme: { primary: "blue" } }, null, "p").theme.primary).toBe(DEFAULT_DESIGN_SPEC.theme.primary);
  });

  it("ignores an invalid stored design", () => {
    const spec = resolvePostDesign(account, { theme: { accent: "nope" } }, "post_1");
    expect(["#ff0000", "#00aa00", "#0000aa"]).toContain(spec.theme.accent);
  });
});
