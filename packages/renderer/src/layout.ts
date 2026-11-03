import type { DesignSpec } from "./spec";
import { wrapJapanese } from "./wrap";

/**
 * Layout of one slide as a flat list of elements (shapes, text, images) in paint order. Both the HTML
 * preview and the PPTX that goes to Canva are drawn from this list, so they always agree.
 */

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

export type SlideFieldsLike = Readonly<Record<string, string>>;
export type SlideKind = "cover" | "empathy" | "point" | "pick" | "cta";
export type Align = "left" | "center" | "right";
export interface Box { x: number; y: number; w: number; h: number }

export type LayoutEl = { role?: "decor" | "frame" | "bar" | "pager" | "pager-active" | "handle" } & (
  | { type: "shape"; shape: "rect" | "roundRect" | "ellipse"; box: Box; fill: string; opacity?: number; line?: { color: string; width: number }; radius?: number }
  | {
      type: "text";
      box: Box;
      text: string;
      px: number;
      weight: number;
      color: string;
      align: Align;
      underline?: boolean;
      /** Vertical placement inside the box; default middle. */
      valign?: "top" | "middle";
      /** A filled pill/panel behind the text (one editable element in Canva). */
      fill?: string;
      radius?: number;
    }
  | { type: "image"; box: Box; src: string; radius?: number }
);

export interface LayoutInput {
  spec: DesignSpec;
  /** 1-8 */
  index: number;
  fields: SlideFieldsLike;
  handle: string;
  /** Image data URLs by slot (`s3_image`). A page with an image gets an image layout. */
  images?: Readonly<Record<string, string>>;
}

/** Role of each of the 8 pages. */
export function slideKind(index: number): SlideKind {
  if (index === 1) return "cover";
  if (index === 2) return "empathy";
  if (index === 7) return "pick";
  if (index === 8) return "cta";
  return "point";
}

/** Share of a box a line may use, so the receiving app's own wrapping never kicks in on top of ours. */
const LINE_FILL = 0.94;
const fit = (text: string, width: number, px: number): string => wrapJapanese(text, (width * LINE_FILL) / px);

const CONTENT_X = 110;
const CONTENT_W = 860;
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

function decor(spec: DesignSpec): LayoutEl[] {
  const { theme: c, layout: l } = spec;
  switch (l.decor) {
    case "blobs":
      return [
        { role: "decor", type: "shape", shape: "ellipse", box: box(620, -170, 460, 460), fill: c.accent },
        { role: "decor", type: "shape", shape: "ellipse", box: box(-260, 1130, 900, 520), fill: c.bar }
      ];
    case "dots": {
      const dots: LayoutEl[] = [];
      for (let y = 30; y < SLIDE_HEIGHT; y += 108) {
        for (let x = 30; x < SLIDE_WIDTH; x += 108) {
          dots.push({ role: "decor", type: "shape", shape: "ellipse", box: box(x, y, 12, 12), fill: c.accent, opacity: 0.55 });
        }
      }
      return dots;
    }
    case "stripes":
      return Array.from({ length: 10 }, (_, i) => ({
        role: "decor" as const, type: "shape" as const, shape: "rect" as const, box: box(i * 108 + 40, 0, 26, SLIDE_HEIGHT), fill: c.accent, opacity: 0.25
      }));
    default:
      return [];
  }
}

function frame(spec: DesignSpec): LayoutEl[] {
  const { theme: c, layout: l } = spec;
  if (l.frame === "none") return [];
  return [
    {
      role: "frame", type: "shape", shape: "roundRect", box: box(40, 50, 1000, 1130), radius: l.radius, fill: c.card,
      ...(l.frame === "outline" ? { line: { color: c.primary, width: 8 } } : {})
    }
  ];
}

function bar(spec: DesignSpec, index: number, handle: string): LayoutEl[] {
  const c = spec.theme;
  const els: LayoutEl[] = [
    { role: "bar", type: "shape", shape: "rect", box: box(0, 1200, SLIDE_WIDTH, 150), fill: c.bar },
    { role: "handle", type: "text", box: box(60, 1200, 500, 150), text: handle, px: 38, weight: 700, color: c.onBar, align: "left" }
  ];
  const start = SLIDE_WIDTH - 60 - (8 * 34 + 7 * 18);
  for (let i = 0; i < 8; i++) {
    const active = i + 1 === index;
    els.push({
      role: active ? "pager-active" : "pager", type: "shape", shape: "ellipse", box: box(start + i * 52, 1258, 34, 34),
      fill: active ? c.accent : c.onBar, ...(active ? {} : { opacity: 0.4 })
    });
  }
  return els;
}

function content({ spec, index, fields: f, images }: LayoutInput): LayoutEl[] {
  const { theme: c, type: t, layout: l } = spec;
  const get = (key: string) => f[`s${index}_${key}`] ?? "";
  const image = images?.[`s${index}_image`];
  const els: LayoutEl[] = [];

  const text = (b: Box, value: string, px: number, weight: number, color: string, align: Align, extra: { underline?: boolean; fill?: string; radius?: number; wrap?: boolean; valign?: "top" | "middle" } = {}) =>
    els.push({
      type: "text", box: b, text: extra.wrap === false ? value : fit(value, b.w - (extra.fill ? 80 : 0), px), px, weight, color, align,
      ...(extra.underline ? { underline: true } : {}),
      ...(extra.valign ? { valign: extra.valign } : {}),
      ...(extra.fill ? { fill: extra.fill, radius: extra.radius } : {})
    });
  const pill = (b: Box, value: string, px: number, weight: number) =>
    text(b, value, px, weight, c.onAccent, "center", { fill: c.accent, radius: Math.floor(b.h / 2), wrap: false });
  const picture = (b: Box) => image && els.push({ type: "image", box: b, src: image, radius: Math.max(0, l.radius - 8) });
  const head = (b: Box, value: string, px: number, color: string, align: Align) =>
    text(b, value, px * t.headScale, t.headWeight, color, align, { underline: t.underlineHeads });
  const body = (b: Box, px: number, align: Align = l.bodyAlign, valign?: "top" | "middle") =>
    text(b, get("body"), px * t.bodyScale, t.bodyWeight, c.ink, align, { valign });

  switch (slideKind(index)) {
    case "cover": {
      if (image) {
        picture(box(CONTENT_X, 110, CONTENT_W, 500));
        text(box(CONTENT_X, 640, CONTENT_W, 280), get("title"), 100 * t.headScale, t.headWeight, c.primary, l.headAlign);
        pill(box(140, 960, 800, 120), get("sub"), 56 * t.bodyScale, t.bodyWeight);
      } else {
        text(box(CONTENT_X, 300, CONTENT_W, 430), get("title"), 118 * t.headScale, t.headWeight, c.primary, l.headAlign);
        pill(box(140, 780, 800, 140), get("sub"), 56 * t.bodyScale, t.bodyWeight);
      }
      break;
    }
    case "empathy": {
      const panel = (b: Box, px: number) =>
        text(b, get("head"), px * t.headScale, t.headWeight, c.onBar, "center", { underline: t.underlineHeads, fill: c.bar, radius: Math.max(0, l.radius - 8), wrap: false });
      if (image) {
        panel(box(CONTENT_X, 130, CONTENT_W, 200), 96);
        picture(box(CONTENT_X, 360, CONTENT_W, 340));
        body(box(CONTENT_X, 730, CONTENT_W, 380), 44);
      } else {
        panel(box(CONTENT_X, 250, CONTENT_W, 240), 110);
        body(box(CONTENT_X, 540, CONTENT_W, 420), 44);
      }
      break;
    }
    case "pick": {
      if (image) {
        pill(box(250, 130, 580, 120), get("label"), 70, 800);
        head(box(CONTENT_X, 270, CONTENT_W, 160), get("head"), 100, c.primary, l.headAlign);
        picture(box(CONTENT_X, 450, CONTENT_W, 300));
        body(box(CONTENT_X, 780, CONTENT_W, 330), 44);
      } else {
        pill(box(250, 160, 580, 130), get("label"), 70, 800);
        head(box(CONTENT_X, 330, CONTENT_W, 220), get("head"), 110, c.primary, l.headAlign);
        body(box(CONTENT_X, 600, CONTENT_W, 400), 44);
      }
      break;
    }
    case "cta": {
      if (image) {
        picture(box(CONTENT_X, 130, CONTENT_W, 380));
        head(box(CONTENT_X, 540, CONTENT_W, 220), get("head"), 100, c.primary, l.headAlign);
        pill(box(190, 800, 700, 150), f.s8_cta ?? "", 88 * t.headScale, t.headWeight);
      } else {
        head(box(CONTENT_X, 380, CONTENT_W, 300), get("head"), 110, c.primary, l.headAlign);
        pill(box(190, 720, 700, 170), f.s8_cta ?? "", 88 * t.headScale, t.headWeight);
      }
      break;
    }
    default: {
      const num = (b: Box, px: number, color: string, align: Align) => text(b, get("num"), px * t.numScale, 800, color, align, { wrap: false });
      if (l.structure === "split") {
        num(box(CONTENT_X, 130, 230, 300), 200, c.primary, l.numberAlign);
        els.push({ type: "shape", shape: "rect", box: box(350, 150, 10, 820), fill: c.accent });
        head(box(385, 140, 585, 230), get("head"), 96, c.primary, "left");
        if (image) {
          body(box(385, 400, 585, 330), 44, "left", "top");
          picture(box(385, 760, 585, 360));
        } else {
          body(box(385, 410, 585, 600), 44, "left", "top");
        }
      } else if (l.structure === "banner") {
        els.push({ type: "shape", shape: "roundRect", box: box(CONTENT_X, 110, CONTENT_W, 290), radius: Math.max(0, l.radius - 8), fill: c.accent });
        num(box(140, 120, 200, 270), 190, c.onAccent, l.numberAlign);
        head(box(360, 130, 580, 250), get("head"), 100, c.onAccent, "left");
        if (image) {
          body(box(CONTENT_X, 440, CONTENT_W, 300), 46, l.bodyAlign, "top");
          picture(box(CONTENT_X, 770, CONTENT_W, 350));
        } else {
          body(box(CONTENT_X, 450, CONTENT_W, 560), 46, l.bodyAlign, "top");
        }
      } else if (image) {
        num(box(CONTENT_X, 100, CONTENT_W, 230), 190, c.primary, l.numberAlign);
        text(box(CONTENT_X, 345, CONTENT_W, 150), get("head"), 96 * t.headScale, t.headWeight, c.onAccent, "center", { underline: t.underlineHeads, fill: c.accent, radius: 75, wrap: false });
        body(box(CONTENT_X, 520, CONTENT_W, 230), 42);
        picture(box(CONTENT_X, 770, CONTENT_W, 350));
      } else {
        num(box(CONTENT_X, 110, CONTENT_W, 330), 270, c.primary, l.numberAlign);
        text(box(CONTENT_X, 470, CONTENT_W, 190), get("head"), 110 * t.headScale, t.headWeight, c.onAccent, "center", { underline: t.underlineHeads, fill: c.accent, radius: 95, wrap: false });
        body(box(CONTENT_X, 700, CONTENT_W, 330), 44);
      }
    }
  }
  return els;
}

/** All elements of one slide in paint order (decoration, frame, content, bottom bar). */
export function layoutSlide(input: LayoutInput): LayoutEl[] {
  return [...decor(input.spec), ...frame(input.spec), ...content(input), ...bar(input.spec, input.index, input.handle)];
}
