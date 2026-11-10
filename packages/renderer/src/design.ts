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
  return `You design the look of an Instagram carousel account (1080x1350 pages, Japanese copy). The attached images are the reference posts the new design must follow. The references are the primary source of the look: reproduce their actual color palette (read the real background, panel, heading, accent and bar colors from the pixels, do not substitute a generic palette), type weight, density, corner roundness, decoration and page layout as closely as the fields below allow. Never copy any text, characters, illustrations or logos.
${referenceNote?.trim() ? `\nReference source: ${referenceNote.trim()}` : ""}${guideline?.trim() ? `\n\nWritten guideline from the account owner. It adds to the references: use it for things the images do not show and for explicit rules (things to avoid, tone). Where it conflicts with the references on colors, layout or decoration, follow the references:\n${guideline.trim()}` : ""}

Return ONLY a JSON object:
{
  "summary": "one or two sentences describing the design you chose, in Japanese",
  "theme": { "bg", "card", "ink", "primary", "accent", "onAccent", "bar", "onBar", "accentAlternates" },
  "type": { "headWeight", "bodyWeight", "headScale", "bodyScale", "numScale", "underlineHeads", "letterSpacing" },
  "layout": { "numberAlign", "headAlign", "bodyAlign", "frame", "radius", "decor", "structure", "variety" }
}
Rules:
- Colors are hex like "#1a2b3c". bg = page background, card = panel surface, ink = body text, primary = headings/numbers/frame, accent = pills + decoration, onAccent = text on accent, bar = bottom bar + dark panels, onBar = text on the bar. Keep text readable (dark on light, light on dark).
- accentAlternates: 2-4 other accent colors that fit the same palette; each post will use one of them so posts do not all look identical.
- headWeight/bodyWeight 300-900; headScale/bodyScale 0.8-1.1 (never enlarge: copy is length-limited); numScale 0.6-1.2; letterSpacing -0.02..0.1 (em).
- numberAlign/headAlign/bodyAlign: "left"|"center"|"right". frame: "outline"|"filled"|"none". radius: 0-64. decor: "blobs"|"dots"|"stripes"|"none". structure: how the content pages are arranged: "classic" (number, heading pill, text stacked), "split" (number in a left column, heading and text on the right), "banner" (heading in a colored band on top, text below). variety: how much each post may deviate: "none"|"subtle"|"lively".
Omit anything you are unsure about.`;
}

export interface DesignRequest extends ReferenceInput {
  apiKey?: string;
  /** Screenshots as data URLs or https URLs. */
  images: readonly string[];
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
            ...input.images.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } }))
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
