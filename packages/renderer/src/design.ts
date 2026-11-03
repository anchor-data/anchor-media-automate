import { applySpecPatch, DEFAULT_DESIGN_SPEC, ensureReadable, type DesignSpec } from "./spec";
import { parseSpecPatch } from "./nl";

const MODEL = "gpt-4.1";

export interface ReferenceInput {
  guideline?: string;
  /** Where the screenshots come from (an Instagram handle or link). Stored as a note only, never fetched. */
  referenceNote?: string;
}

/** Prompt for turning reference screenshots + a written guideline into a full design. */
export function buildReferencePrompt({ guideline, referenceNote }: ReferenceInput): string {
  return `You design the look of an Instagram carousel account (1080x1350 pages, Japanese copy). The attached images are reference posts to take inspiration from: capture their color palette, type weight, density, corner roundness, decoration and layout feel, but do not copy any text, characters or logos.
${referenceNote?.trim() ? `\nReference source: ${referenceNote.trim()}` : ""}${guideline?.trim() ? `\n\nWritten design guideline from the account owner (it takes priority over the references):\n${guideline.trim()}` : ""}

Return ONLY a JSON object:
{
  "summary": "one or two sentences describing the design you chose, in Japanese",
  "theme": { "bg", "card", "ink", "primary", "accent", "onAccent", "bar", "onBar", "accentAlternates" },
  "type": { "headWeight", "bodyWeight", "headScale", "bodyScale", "numScale", "underlineHeads", "letterSpacing" },
  "layout": { "numberAlign", "headAlign", "bodyAlign", "frame", "radius", "decor", "variety" }
}
Rules:
- Colors are hex like "#1a2b3c". bg = page background, card = panel surface, ink = body text, primary = headings/numbers/frame, accent = pills + decoration, onAccent = text on accent, bar = bottom bar + dark panels, onBar = text on the bar. Keep text readable (dark on light, light on dark).
- accentAlternates: 2-4 other accent colors that fit the same palette; each post will use one of them so posts do not all look identical.
- headWeight/bodyWeight 300-900; headScale/bodyScale 0.8-1.1 (never enlarge: copy is length-limited); numScale 0.6-1.2; letterSpacing -0.02..0.1 (em).
- numberAlign/headAlign/bodyAlign: "left"|"center"|"right". frame: "outline"|"filled"|"none". radius: 0-64. decor: "blobs"|"dots"|"stripes"|"none". variety: how much each post may deviate: "none"|"subtle"|"lively".
Omit anything you are unsure about.`;
}

export interface DesignRequest extends ReferenceInput {
  apiKey?: string;
  /** Screenshots as data URLs or https URLs. */
  images: readonly string[];
  fetchImpl?: typeof fetch;
}

/** Reference screenshots (+ guideline) -> the account's DesignSpec, passed through the readability guardrail. */
export async function requestDesignFromReferences(input: DesignRequest): Promise<{ spec: DesignSpec; summary: string }> {
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
            ...input.images.map((url) => ({ type: "image_url", image_url: { url, detail: "auto" } }))
          ]
        }
      ]
    })
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const patch = parseSpecPatch(data.choices?.[0]?.message?.content ?? "");
  const summary = typeof patch.summary === "string" ? patch.summary : "";
  return { spec: ensureReadable(applySpecPatch(DEFAULT_DESIGN_SPEC, patch)), summary };
}
