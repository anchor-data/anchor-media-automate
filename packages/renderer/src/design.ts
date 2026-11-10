import { roleOf, type SlideRole } from "@ama/shared";
import { applySpecPatch, DEFAULT_DESIGN_SPEC, ensureReadable, type DesignSpec } from "./spec";
import { parseSpecPatch, usageOf, type ChatResponse, type ModelUsage } from "./nl";

const MODEL = "gpt-4.1";

export interface ReferenceInput {
  guideline?: string;
  /** Where the screenshots come from (an Instagram handle or link). Stored as a note only, never fetched. */
  referenceNote?: string;
}

/** Prompt for turning reference screenshots + a written guideline into a full design. */
export function buildReferencePrompt({ guideline, referenceNote }: ReferenceInput): string {
  return `You are an art director designing an Instagram carousel (1080x1350 pages, Japanese copy) that stops people mid-scroll. Make it creative and eye-catching: confident color contrast, bold type with a clear hierarchy, a memorable cover, and a distinct personality instead of a safe, generic template. Creativity never comes before legibility: the text must stay instantly readable on a phone.

The attached images are the reference posts the new design must follow. They are the primary source of the look, so borrow from them directly: copy how the elements are arranged (where the number, heading and body sit, how the page is split, alignment, spacing and density), how legible they are (text size and weight against the background, contrast, how the heading is set off), and their frame and panel treatment (frame style, corner roundness, borders, decoration), plus their actual color palette (read the real background, panel, heading, accent and bar colors from the pixels; do not substitute a generic palette). Reproduce all of this as closely as the fields below allow. Never copy any text, characters, illustrations or logos.
${referenceNote?.trim() ? `\nReference source: ${referenceNote.trim()}` : ""}${guideline?.trim() ? `\n\nWritten guideline from the account owner. It adds to the references: use it for things the images do not show and for explicit rules (things to avoid, tone). Where it conflicts with the references on colors, layout or decoration, follow the references:\n${guideline.trim()}` : ""}

Return ONLY a JSON object:
{
  "summary": "one or two sentences describing the design you chose, in Japanese",
  "theme": { "bg", "card", "ink", "primary", "accent", "onAccent", "bar", "onBar", "accentAlternates" },
  "type": { "headWeight", "bodyWeight", "headScale", "bodyScale", "numScale", "underlineHeads", "letterSpacing" },
  "layout": { "numberAlign", "headAlign", "bodyAlign", "frame", "radius", "decor", "structure", "variety" },
  "roles": { "cover"|"empathy"|"point"|"pick"|"cta": { "theme": { "bg", "card", "ink", "primary", "bar", "onBar" }, "type": { "headWeight", "bodyWeight", "headScale", "bodyScale", "numScale", "underlineHeads" }, "layout": { "numberAlign", "headAlign", "bodyAlign", "frame", "radius", "decor", "structure" } } }
}
Rules:
- Colors are hex like "#1a2b3c". bg = page background, card = panel surface, ink = body text, primary = headings/numbers/frame, accent = pills + decoration, onAccent = text on accent, bar = bottom bar + dark panels, onBar = text on the bar. Keep text readable (dark on light, light on dark).
- accentAlternates: 2-4 other accent colors that fit the same palette; each post will use one of them so posts do not all look identical.
- headWeight/bodyWeight 300-900; headScale/bodyScale 0.8-1.1 (never enlarge: copy is length-limited); numScale 0.6-1.2; letterSpacing -0.02..0.1 (em).
- numberAlign/headAlign/bodyAlign: "left"|"center"|"right". frame: "outline"|"filled"|"none". radius: 0-64. decor: "blobs"|"dots"|"stripes"|"none". structure: how the content pages are arranged: "classic" (number, heading pill, text stacked), "split" (number in a left column, heading and text on the right), "banner" (heading in a colored band on top, text below). variety: how much each post may deviate: "none"|"subtle"|"lively".
- theme / type / layout describe the most common kind of page (the content pages). "roles" is for the kinds of page that clearly look different in the references (typically the cover and the closing page: a darker or more colorful panel, another frame or decoration). For such a role give only the fields that differ, using colors from that page's reference; leave a role out when it looks like the rest. The accent stays shared, so do not put it in a role.
Omit anything you are unsure about.

Some images are labelled with the page of the carousel they show (page 1 is the cover, the last page is the closing call to action). Pages of different roles may look different (the cover often has stronger colors, a dark panel or bigger type): describe each such page's own look in its role (see above) and keep the base design for the content pages. When several images show the same page, find what they share.`;
}

/** "Reference image 2 - page 3 of the carousel (point)": tells the model what each screenshot is. */
export function referenceLabel(index: number, page: number | null | undefined, structure?: readonly SlideRole[], palette?: string): string {
  const role = page && structure ? roleOf(structure, page) : null;
  const where = page ? ` - page ${page} of the carousel${role ? ` (${role})` : ""}` : "";
  const colors = palette ? `. Measured dominant colors (hex, share of the image; use these exact hex values for the matching surfaces instead of estimating): ${palette}` : "";
  return `Reference image ${index + 1}${where}${colors}`;
}

export interface DesignRequest extends ReferenceInput {
  apiKey?: string;
  /** Screenshots as data URLs or https URLs. */
  images: readonly string[];
  /** Which page of the carousel each image shows (1 = cover), same order as `images`; null/0 = not said. */
  pages?: ReadonlyArray<number | null>;
  /** Measured dominant colors of each image ("#1d4a43 62%, ..."), same order as `images`; "" = not measured. */
  palettes?: readonly string[];
  /** The account's page structure, to name the role of a numbered page. */
  structure?: readonly SlideRole[];
  fetchImpl?: typeof fetch;
}

/** Reference screenshots (+ guideline) -> the account's DesignSpec, passed through the readability guardrail. */
export async function requestDesignFromReferences(
  input: DesignRequest
): Promise<{ spec: DesignSpec; summary: string; usage: ModelUsage | undefined }> {
  if (input.images.length === 0 && !input.guideline?.trim()) {
    throw new Error("Add reference screenshots or a design guideline");
  }
  if (!input.apiKey) throw new Error("OpenAI API key is not configured");
  const fetchImpl = input.fetchImpl ?? ((url, init) => fetch(url, init));
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildReferencePrompt(input) },
            ...input.images.flatMap((url, index) => [
              { type: "text", text: referenceLabel(index, input.pages?.[index], input.structure, input.palettes?.[index]) },
              { type: "image_url", image_url: { url, detail: "high" } }
            ])
          ]
        }
      ]
    })
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
  const data = (await response.json()) as ChatResponse;
  const patch = parseSpecPatch(data.choices?.[0]?.message?.content ?? "");
  const summary = typeof patch.summary === "string" ? patch.summary : "";
  return { spec: ensureReadable(applySpecPatch(DEFAULT_DESIGN_SPEC, patch)), summary, usage: usageOf(MODEL, data) };
}
