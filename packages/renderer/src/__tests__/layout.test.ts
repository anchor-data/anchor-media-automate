import { describe, expect, it } from "vitest";
import { layoutSlide, type LayoutEl } from "../layout";
import { applySpecPatch, DEFAULT_DESIGN_SPEC, type DesignSpec } from "../spec";

const fields = {
  s1_title: "転職で後悔しない準備", s1_sub: "3分でわかる",
  s2_head: "不安だよね", s2_body: "何から始めればいいか分からない",
  s3_num: "1", s3_head: "自己分析", s3_body: "得意なことや苦手なことを整理して、次の仕事で大切にしたいことを見つけよう。",
  s4_num: "2", s4_head: "軸を決める", s4_body: "譲れない条件を分けて考えよう",
  s5_num: "3", s5_head: "求人を比べる", s5_body: "同じ基準で比べてみよう",
  s6_num: "4", s6_head: "面接準備", s6_body: "具体例を使って練習しよう",
  s7_label: "まとめ", s7_head: "迷ったら", s7_body: "まずは軸を決めよう",
  s8_head: "保存して見返そう", s8_cta: "フォローしてね"
};
const IMG = "data:image/png;base64,AAAA";

const layout = (spec: DesignSpec, index: number, images?: Record<string, string>): LayoutEl[] =>
  layoutSlide({ spec, index, fields, handle: "@anchor", images });
const texts = (els: LayoutEl[]) => els.filter((el): el is Extract<LayoutEl, { type: "text" }> => el.type === "text");
const images = (els: LayoutEl[]) => els.filter((el) => el.type === "image");
const withStructure = (structure: DesignSpec["layout"]["structure"]) => applySpecPatch(DEFAULT_DESIGN_SPEC, { layout: { structure } });

describe("layoutSlide", () => {
  it("emits the copy of each page as separate text elements", () => {
    const point = texts(layout(DEFAULT_DESIGN_SPEC, 3)).map((t) => t.text.replace(/\n/g, ""));
    expect(point).toContain("1");
    expect(point).toContain("自己分析");
    expect(point.some((t) => t.includes("得意なことや苦手なこと"))).toBe(true);
    expect(texts(layout(DEFAULT_DESIGN_SPEC, 8)).map((t) => t.text)).toContain("フォローしてね");
  });

  it("keeps every element inside the 1080x1350 page except deliberate bleed decoration", () => {
    for (const structure of ["classic", "split", "banner"] as const) {
      for (let index = 1; index <= 8; index++) {
        for (const el of layout(withStructure(structure), index, { [`s${index}_image`]: IMG })) {
          if (el.type !== "text" && el.type !== "image") continue;
          expect(el.box.x).toBeGreaterThanOrEqual(0);
          expect(el.box.y).toBeGreaterThanOrEqual(0);
          expect(el.box.x + el.box.w).toBeLessThanOrEqual(1080);
          expect(el.box.y + el.box.h).toBeLessThanOrEqual(1350);
        }
      }
    }
  });

  it("wraps long body copy into lines before it reaches a backend", () => {
    const body = texts(layout(DEFAULT_DESIGN_SPEC, 3)).find((t) => t.text.includes("得意"))!;
    expect(body.text).toContain("\n");
    expect(body.text.replace(/\n/g, "")).toBe(fields.s3_body);
  });

  it("places an image only when one is supplied for that page", () => {
    expect(images(layout(DEFAULT_DESIGN_SPEC, 3))).toHaveLength(0);
    const withImage = layout(DEFAULT_DESIGN_SPEC, 3, { s3_image: IMG });
    expect(images(withImage)).toHaveLength(1);
    expect(images(layout(DEFAULT_DESIGN_SPEC, 4, { s3_image: IMG }))).toHaveLength(0);
  });

  it("makes room for the image: text and image boxes do not overlap", () => {
    for (const structure of ["classic", "split", "banner"] as const) {
      for (const index of [1, 2, 3, 7, 8]) {
        const els = layout(withStructure(structure), index, { [`s${index}_image`]: IMG });
        const image = els.find((el) => el.type === "image")!;
        for (const t of texts(els)) {
          if (t.box.y >= 1200) continue; // handle in the bottom bar
          const overlapX = t.box.x < image.box.x + image.box.w && image.box.x < t.box.x + t.box.w;
          const overlapY = t.box.y < image.box.y + image.box.h && image.box.y < t.box.y + t.box.h;
          expect(overlapX && overlapY, `${structure} p${index}: "${t.text.slice(0, 8)}" overlaps image`).toBe(false);
        }
      }
    }
  });

  it("changes where the point-page pieces sit with the structure", () => {
    const num = (structure: DesignSpec["layout"]["structure"]) => texts(layout(withStructure(structure), 3)).find((t) => t.text === "1")!.box;
    expect(num("classic")).not.toEqual(num("split"));
    expect(num("split")).not.toEqual(num("banner"));
    const head = (structure: DesignSpec["layout"]["structure"]) => texts(layout(withStructure(structure), 3)).find((t) => t.text === "自己分析")!;
    expect(head("split").align).toBe("left");
    expect(head("banner").align).toBe("left");
  });

  it("follows the spec's alignment, underline and decoration", () => {
    const left = applySpecPatch(DEFAULT_DESIGN_SPEC, { layout: { numberAlign: "left" } });
    expect(texts(layout(left, 3)).find((t) => t.text === "1")!.align).toBe("left");
    const underlined = applySpecPatch(DEFAULT_DESIGN_SPEC, { type: { underlineHeads: true } });
    expect(texts(layout(underlined, 3)).some((t) => t.underline)).toBe(true);
    expect(texts(layout(DEFAULT_DESIGN_SPEC, 3)).some((t) => t.underline)).toBe(false);
    const none = applySpecPatch(DEFAULT_DESIGN_SPEC, { layout: { decor: "none" } });
    expect(layout(none, 3).filter((el) => el.role === "decor")).toHaveLength(0);
    expect(layout(DEFAULT_DESIGN_SPEC, 3).filter((el) => el.role === "decor").length).toBeGreaterThan(0);
  });

  it("highlights the current page in the pager", () => {
    const active = layout(DEFAULT_DESIGN_SPEC, 5).filter((el) => el.role === "pager-active");
    expect(active).toHaveLength(1);
  });
});

describe("text placement", () => {
  it("top-aligns the body next to the heading in the split and banner structures", () => {
    for (const structure of ["split", "banner"] as const) {
      const body = texts(layout(withStructure(structure), 3)).find((t) => t.text.includes("得意"))!;
      expect(body.valign, structure).toBe("top");
    }
    expect(texts(layout(DEFAULT_DESIGN_SPEC, 3)).find((t) => t.text.includes("得意"))!.valign ?? "middle").toBe("middle");
  });
});
