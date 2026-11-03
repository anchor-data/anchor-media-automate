import { describe, expect, it } from "vitest";
import { applySpecPatch, DEFAULT_DESIGN_SPEC } from "../spec";
import { renderSlideHtml, SLIDE_HEIGHT, SLIDE_WIDTH, slideKind, type SlideFieldsLike } from "../html";

const fields: SlideFieldsLike = {
  s1_title: "転職で後悔しない準備", s1_sub: "3分でわかる",
  s2_head: "不安だよね", s2_body: "何から始めればいいか分からない",
  s3_num: "1", s3_head: "自己分析", s3_body: "得意なことを整理しよう",
  s4_num: "2", s4_head: "軸を決める", s4_body: "譲れない条件を分けて考えよう",
  s5_num: "3", s5_head: "求人を比べる", s5_body: "同じ基準で比べてみよう",
  s6_num: "4", s6_head: "面接準備", s6_body: "具体例を使って練習しよう",
  s7_label: "まとめ", s7_head: "迷ったら", s7_body: "まずは軸を決めよう",
  s8_head: "保存して見返そう", s8_cta: "フォローしてね"
};
const render = (spec = DEFAULT_DESIGN_SPEC, index = 3) => renderSlideHtml({ spec, index, fields, handle: "@anchor" });

describe("slideKind", () => {
  it("maps the 8 pages to their roles", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(slideKind)).toEqual(["cover", "empathy", "point", "point", "point", "point", "pick", "cta"]);
  });
});

describe("renderSlideHtml", () => {
  it("is a 1080x1350 document", () => {
    const html = render();
    expect(html).toContain(`width: ${SLIDE_WIDTH}px`);
    expect(html).toContain(`height: ${SLIDE_HEIGHT}px`);
  });

  it("contains the slide text for each page", () => {
    expect(render(DEFAULT_DESIGN_SPEC, 1)).toContain("転職で後悔しない準備");
    expect(render(DEFAULT_DESIGN_SPEC, 3)).toContain("自己分析");
    expect(render(DEFAULT_DESIGN_SPEC, 7)).toContain("迷ったら");
    expect(render(DEFAULT_DESIGN_SPEC, 8)).toContain("フォローしてね");
  });

  it("escapes HTML in copy", () => {
    const html = renderSlideHtml({ spec: DEFAULT_DESIGN_SPEC, index: 3, fields: { ...fields, s3_head: "<script>x</script>" }, handle: "@a" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("puts spec colors into the stylesheet", () => {
    const html = render(applySpecPatch(DEFAULT_DESIGN_SPEC, { theme: { accent: "#12ab34" } }));
    expect(html).toContain("#12ab34");
  });

  it("applies the number alignment", () => {
    expect(render(applySpecPatch(DEFAULT_DESIGN_SPEC, { layout: { numberAlign: "left" } }))).toContain("text-align: left");
  });

  it("underlines headings only when asked", () => {
    expect(render()).not.toContain("underline");
    expect(render(applySpecPatch(DEFAULT_DESIGN_SPEC, { type: { underlineHeads: true } }))).toContain("underline");
  });

  it("uses natural Japanese phrase wrapping", () => {
    expect(render()).toContain("auto-phrase");
  });

  it("omits decoration when the spec says none", () => {
    expect(render(applySpecPatch(DEFAULT_DESIGN_SPEC, { layout: { decor: "none" } }))).not.toContain('class="decor');
    expect(render()).toContain('class="decor');
  });
});

import { renderDeckHtml } from "../html";

describe("renderDeckHtml", () => {
  const deck = renderDeckHtml({ spec: DEFAULT_DESIGN_SPEC, fields, handle: "@anchor" });

  it("contains all 8 slides in one document", () => {
    expect((deck.match(/class="slide"/g) ?? []).length).toBe(8);
    expect(deck).toContain("転職で後悔しない準備");
    expect(deck).toContain("フォローしてね");
  });

  it("sets a print page the size of one slide with no margin, one slide per page", () => {
    expect(deck).toContain(`@page { size: ${SLIDE_WIDTH}px ${SLIDE_HEIGHT}px; margin: 0; }`);
    expect(deck).toContain("break-after: page");
  });

  it("marks the current page in the pager of each slide", () => {
    expect((deck.match(/<i class="on">/g) ?? []).length).toBe(8);
  });
});
