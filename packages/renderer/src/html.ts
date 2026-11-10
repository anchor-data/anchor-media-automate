import { DEFAULT_STRUCTURE } from "@ama/shared";
import { layoutSlide, withRoleSpec, SLIDE_HEIGHT, SLIDE_WIDTH, type Box, type LayoutEl, type LayoutInput } from "./layout";
import type { DesignSpec } from "./spec";

export { SLIDE_HEIGHT, SLIDE_WIDTH, slideKind } from "./layout";
export type { SlideFieldsLike, SlideKind } from "./layout";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** `#rgb`/`#rrggbb` as an rgba() color when `opacity` is given. */
function withOpacity(color: string, opacity: number | undefined): string {
  if (opacity === undefined) return color;
  const digits = color.replace("#", "");
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const boxCss = (b: Box) => `left: ${b.x}px; top: ${b.y}px; width: ${b.w}px; height: ${b.h}px;`;
const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" } as const;

function element(el: LayoutEl, spec: DesignSpec): string {
  const role = el.role ? ` data-role="${el.role}"` : "";
  if (el.type === "shape") {
    const radius = el.shape === "ellipse" ? "border-radius: 50%;" : el.shape === "roundRect" ? `border-radius: ${el.radius ?? 0}px;` : "";
    const line = el.line ? `border: ${el.line.width}px solid ${el.line.color};` : "";
    // Only the fill is translucent (as in the PPTX), so an outline stays solid.
    return `<div class="el"${role} style="${boxCss(el.box)} background: ${withOpacity(el.fill, el.opacity)}; ${radius} ${line}"></div>`;
  }
  if (el.type === "image") {
    const cover = el.fit === "cover";
    const fit = cover ? `object-fit: cover; object-position: 50% ${Math.round((el.focusY ?? 0.5) * 100)}%;` : "object-fit: contain;";
    const flip = el.flip ? " transform: scaleX(-1);" : "";
    return `<img class="el"${role} src="${esc(el.src)}" alt="" style="${boxCss(el.box)} ${fit} border-radius: ${el.radius ?? 0}px;${flip}">`;
  }
  const fill = el.fill ? `background: ${el.fill}; border-radius: ${el.radius ?? 0}px;` : "";
  const underline = el.underline ? " text-decoration: underline; text-underline-offset: 12px;" : "";
  return `<div class="el text"${role} style="${boxCss(el.box)} font-size: ${Math.round(el.px)}px; font-weight: ${el.weight}; color: ${el.color}; text-align: ${el.align}; justify-content: ${JUSTIFY[el.align]}; align-items: ${el.valign === "top" ? "flex-start" : "center"};${underline} ${fill}">${esc(el.text)}</div>`;
}

function css(spec: DesignSpec): string {
  const t = spec.type;
  return `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${SLIDE_WIDTH}px; }
  .slide { position: relative; width: ${SLIDE_WIDTH}px; height: ${SLIDE_HEIGHT}px; overflow: hidden; background: ${spec.theme.bg};
    font-family: "${t.fontFamily}", "Noto Sans JP", "Hiragino Sans", sans-serif; letter-spacing: ${t.letterSpacing}em; }
  .el { position: absolute; }
  .text { display: flex; align-items: center; white-space: pre; line-height: 1.25; overflow: hidden; }`;
}

function slideBlock(input: LayoutInput): string {
  const { spec } = withRoleSpec(input);
  return `<div class="slide" style="background: ${spec.theme.bg}">${layoutSlide(input).map((el) => element(el, spec)).join("")}</div>`;
}

function htmlDocument(spec: DesignSpec, body: string, extraCss = ""): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${css(spec)}${extraCss}</style></head><body>${body}</body></html>`;
}

/** One 1080x1350 slide as a standalone HTML document (the editor's design preview). */
export function renderSlideHtml(input: LayoutInput): string {
  return htmlDocument(input.spec, slideBlock(input), `html, body { height: ${SLIDE_HEIGHT}px; }`);
}

/** All 8 slides in one document, one per printed page. */
export function renderDeckHtml(input: Omit<LayoutInput, "index">): string {
  const pages = (input.structure ?? DEFAULT_STRUCTURE).length;
  const slides = Array.from({ length: pages }, (_, i) => slideBlock({ ...input, index: i + 1 })).join("");
  const print = `
  @page { size: ${SLIDE_WIDTH}px ${SLIDE_HEIGHT}px; margin: 0; }
  html, body { height: auto; }
  .slide { break-after: page; }
  .slide:last-child { break-after: auto; }`;
  return htmlDocument(input.spec, slides, print);
}
