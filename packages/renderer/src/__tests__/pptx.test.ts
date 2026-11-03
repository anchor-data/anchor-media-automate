import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { applySpecPatch, DEFAULT_DESIGN_SPEC } from "../spec";
import { renderDeckPptx, PPTX_MIME, pxToInches } from "../pptx";

const fields = {
  s1_title: "転職で後悔しない準備", s1_sub: "3分でわかる",
  s2_head: "不安だよね", s2_body: "何から始めればいいか分からない",
  s3_num: "1", s3_head: "自己分析", s3_body: "得意なことを整理しよう",
  s4_num: "2", s4_head: "軸を決める", s4_body: "譲れない条件を分けて考えよう",
  s5_num: "3", s5_head: "求人を比べる", s5_body: "同じ基準で比べてみよう",
  s6_num: "4", s6_head: "面接準備", s6_body: "具体例を使って練習しよう",
  s7_label: "まとめ", s7_head: "迷ったら", s7_body: "まずは軸を決めよう",
  s8_head: "保存して見返そう", s8_cta: "フォローしてね"
};

async function open(spec = DEFAULT_DESIGN_SPEC) {
  const bytes = await renderDeckPptx({ spec, fields, handle: "@anchor" });
  return { bytes, zip: await JSZip.loadAsync(bytes) };
}

const slideXml = async (zip: JSZip, n: number) => zip.file(`ppt/slides/slide${n}.xml`)!.async("string");

describe("pxToInches", () => {
  it("maps 1080px to 7.5in (Canva imports PPTX at 144 px per inch)", () => {
    expect(pxToInches(1080)).toBeCloseTo(7.5, 5);
    expect(pxToInches(1350)).toBeCloseTo(9.375, 5);
  });
});

describe("renderDeckPptx", () => {
  it("is a valid pptx zip with 8 slides", async () => {
    const { bytes, zip } = await open();
    expect(PPTX_MIME).toContain("presentationml");
    expect(bytes[0]).toBe(0x50); // "PK"
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slides).toHaveLength(8);
  });

  it("uses a 1080x1350 page", async () => {
    const { zip } = await open();
    const presentation = await zip.file("ppt/presentation.xml")!.async("string");
    const size = presentation.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
    expect(Number(size?.[1])).toBe(Math.round(7.5 * 914400));
    expect(Number(size?.[2])).toBe(Math.round(9.375 * 914400));
  });

  it("keeps each piece of copy in its own text element", async () => {
    const { zip } = await open();
    const xml = await slideXml(zip, 3);
    expect(xml).toContain("自己分析");
    expect(xml).toContain("得意なことを整理しよう");
    // number, heading and body are separate runs of separate shapes
    expect((xml.match(/<p:txBody>/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("applies spec colors and the font", async () => {
    const { zip } = await open(applySpecPatch(DEFAULT_DESIGN_SPEC, { theme: { accent: "#12ab34" } }));
    expect(await slideXml(zip, 3)).toContain("12AB34");
    expect(await slideXml(zip, 3)).toContain("Noto Sans JP");
  });

  it("underlines headings only when asked", async () => {
    expect(await slideXml((await open()).zip, 3)).not.toContain('u="sng"');
    const on = await open(applySpecPatch(DEFAULT_DESIGN_SPEC, { type: { underlineHeads: true } }));
    expect(await slideXml(on.zip, 3)).toContain('u="sng"');
  });

  it("aligns the number as the spec says", async () => {
    const left = await open(applySpecPatch(DEFAULT_DESIGN_SPEC, { layout: { numberAlign: "left" } }));
    const xml = await slideXml(left.zip, 3);
    const number = xml.slice(xml.lastIndexOf("<p:sp>", xml.indexOf(">1<")));
    expect(number).toContain('algn="l"');
  });

  it("puts every slide's copy on its page", async () => {
    const { zip } = await open();
    const cover = (await slideXml(zip, 1)).match(/<a:t>([^<]*)<\/a:t>/g)?.map((t) => t.replace(/<\/?a:t>/g, "")).join("");
    expect(cover).toContain("転職で後悔しない準備");
    expect(await slideXml(zip, 7)).toContain("迷ったら");
    expect(await slideXml(zip, 8)).toContain("フォローしてね");
  });
});

describe("line wrapping in the pptx", () => {
  const long = { ...fields, s3_body: "大規模でもサーバー側で事前生成。画面切替がとにかく早い！" };

  it("breaks long body copy at word boundaries before it reaches Canva", async () => {
    const bytes = await renderDeckPptx({ spec: DEFAULT_DESIGN_SPEC, fields: long, handle: "@a" });
    const xml = await (await JSZip.loadAsync(bytes)).file("ppt/slides/slide3.xml")!.async("string");
    const text = (xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((t) => t.replace(/<\/?a:t>/g, ""));
    const bodyLines = text.filter((t) => /生成|切替|早い|大規模|サーバー/.test(t));
    expect(bodyLines.length).toBeGreaterThanOrEqual(2);
    expect(bodyLines.join("")).toBe(long.s3_body);
    expect(bodyLines.join("|")).not.toMatch(/画\|面|切\|替/);
  });
});

describe("images in the pptx", () => {
  // 1x1 transparent PNG
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

  it("embeds a supplied image on its page only", async () => {
    const bytes = await renderDeckPptx({ spec: DEFAULT_DESIGN_SPEC, fields, handle: "@a", images: { s3_image: PNG } });
    const zip = await JSZip.loadAsync(bytes);
    expect(await slideXml(zip, 3)).toContain("<p:pic>");
    expect(await slideXml(zip, 4)).not.toContain("<p:pic>");
    expect(Object.keys(zip.files).some((name) => name.startsWith("ppt/media/"))).toBe(true);
  });

  it("makes no picture elements without images", async () => {
    const { zip } = await open();
    for (let n = 1; n <= 8; n++) expect(await slideXml(zip, n)).not.toContain("<p:pic>");
  });

  it("lays the point page out differently for each structure", async () => {
    const xml = async (structure: "classic" | "split" | "banner") =>
      slideXml((await open(applySpecPatch(DEFAULT_DESIGN_SPEC, { layout: { structure } }))).zip, 3);
    const [a, b, c] = [await xml("classic"), await xml("split"), await xml("banner")];
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("variable structures in the pptx", () => {
  const structure = ["cover", "point", "point", "cta"] as const;
  const shortFields = { s1_title: "タイトル", s1_sub: "サブ", s2_num: "1", s2_head: "一つ目", s2_body: "本文一", s3_num: "2", s3_head: "二つ目", s3_body: "本文二", s4_head: "保存して", s4_cta: "フォロー" };

  it("has one slide per page of the structure", async () => {
    const bytes = await renderDeckPptx({ spec: DEFAULT_DESIGN_SPEC, fields: shortFields, handle: "@a", structure: [...structure] });
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slides).toHaveLength(4);
    expect(await slideXml(zip, 4)).toContain("フォロー");
  });
});
