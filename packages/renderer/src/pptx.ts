import PptxGenJS from "pptxgenjs";
import { layoutSlide, SLIDE_HEIGHT, SLIDE_WIDTH, type Box, type LayoutEl, type SlideFieldsLike } from "./layout";
import type { DesignSpec } from "./spec";

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Canva imports a PPTX at 144 px per inch (a 13.333in slide becomes 1920px). */
const PX_PER_INCH = 144;
/** 1 pt = 1/72 in, so at 144 px/in a font size in pt is half its size in px. */
const PT_PER_PX = 72 / PX_PER_INCH;

export const pxToInches = (px: number): number => px / PX_PER_INCH;
const pt = (px: number): number => Math.max(1, Math.round(px * PT_PER_PX));
const hex = (color: string): string => {
  const digits = color.replace("#", "").toUpperCase();
  return digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits;
};
const inches = (b: Box) => ({ x: pxToInches(b.x), y: pxToInches(b.y), w: pxToInches(b.w), h: pxToInches(b.h) });

export interface DeckPptxInput {
  spec: DesignSpec;
  fields: SlideFieldsLike;
  handle: string;
  /** Image data URLs by slot (`s3_image`). */
  images?: Readonly<Record<string, string>>;
}

type Slide = ReturnType<PptxGenJS["addSlide"]>;

function draw(pptx: PptxGenJS, slide: Slide, spec: DesignSpec, el: LayoutEl): void {
  if (el.type === "shape") {
    const fill = { color: hex(el.fill), ...(el.opacity !== undefined ? { transparency: Math.round((1 - el.opacity) * 100) } : {}) };
    const common = { ...inches(el.box), fill, line: el.line ? { color: hex(el.line.color), width: pt(el.line.width) } : { type: "none" as const } };
    if (el.shape === "ellipse") slide.addShape(pptx.ShapeType.ellipse, common);
    else if (el.shape === "roundRect") slide.addShape(pptx.ShapeType.roundRect, { ...common, rectRadius: pxToInches(el.radius ?? 0) });
    else slide.addShape(pptx.ShapeType.rect, common);
    return;
  }
  if (el.type === "image") {
    const size = inches(el.box);
    slide.addImage({ data: el.src.replace(/^data:/, ""), ...size, sizing: { type: "cover", w: size.w, h: size.h } });
    return;
  }
  slide.addText(el.text, {
    ...inches(el.box),
    fontFace: spec.type.fontFamily,
    fontSize: pt(el.px),
    bold: el.weight >= 700,
    color: hex(el.color),
    align: el.align,
    valign: "middle",
    margin: 0,
    ...(el.underline ? { underline: { style: "sng" as const } } : {}),
    ...(el.fill
      ? { shape: pptx.ShapeType.roundRect, rectRadius: pxToInches(el.radius ?? 0), fill: { color: hex(el.fill) }, line: { type: "none" as const } }
      : {})
  });
}

/**
 * All 8 slides as a PPTX whose elements (text boxes, rounded shapes, circles, images) stay separate,
 * so the file imports into Canva as a design a human can edit element by element.
 */
export async function renderDeckPptx({ spec, fields, handle, images }: DeckPptxInput): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "IG_4_5", width: pxToInches(SLIDE_WIDTH), height: pxToInches(SLIDE_HEIGHT) });
  pptx.layout = "IG_4_5";
  for (let index = 1; index <= 8; index++) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(spec.theme.bg) };
    for (const el of layoutSlide({ spec, index, fields, handle, images })) draw(pptx, slide, spec, el);
  }
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}
