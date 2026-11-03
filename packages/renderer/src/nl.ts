import { applySpecPatch, ensureReadable, type DesignSpec } from "./spec";

const MODEL = "gpt-4.1";

/** Prompt that turns a free-text design request into a partial DesignSpec (JSON patch). */
export function buildSpecPrompt(request: string, current: DesignSpec, guideline = ""): string {
  return `You translate a design request for an Instagram carousel (1080x1350, Japanese text) into a JSON patch.

Current design (JSON):
${JSON.stringify(current)}

Return ONLY a JSON object with the fields to CHANGE (omit everything else). Allowed fields and values:
- theme: bg, card, ink, primary, accent, onAccent, bar, onBar — hex colors like "#1a2b3c".
  ink = body text, primary = headings/numbers/frame, accent = pills + decoration, onAccent = text on accent, bar = bottom bar + dark panels, onBar = text on the bar.
  Keep text readable: dark text on light surfaces and light text on dark ones. Change related colors together so the palette stays coherent.
- type: headWeight (300-900), bodyWeight (300-900), headScale (0.8-1.1), bodyScale (0.8-1.1), numScale (0.6-1.2), underlineHeads (boolean), letterSpacing (-0.02..0.1, em).
  Never enlarge text above 1.1: copy is length-limited to fit.
- layout: numberAlign / headAlign / bodyAlign ("left"|"center"|"right"), frame ("outline"|"filled"|"none"), radius (0-64 px), decor ("blobs"|"dots"|"stripes"|"none"), variety ("none"|"subtle"|"lively").

${guideline.trim() ? `Account design guideline (keep consistent with it unless the request says otherwise):\n${guideline.trim()}\n\n` : ""}Request: ${request}`;
}

/** Extract the first JSON object from a model reply; {} when there is none. */
export function parseSpecPatch(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface SpecRequest {
  apiKey?: string;
  request: string;
  current: DesignSpec;
  /** The account's written design guideline, if any. */
  guideline?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Free text -> new DesignSpec. The model only proposes a patch; invalid fields are dropped and the
 * result is passed through the readability guardrail before it is used.
 */
export async function requestSpecPatch(input: SpecRequest): Promise<{ spec: DesignSpec; patch: Record<string, unknown> }> {
  if (!input.apiKey) throw new Error("OpenAI API key is not configured");
  const fetchImpl = input.fetchImpl ?? ((url, init) => fetch(url, init));
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildSpecPrompt(input.request, input.current, input.guideline) }]
    })
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const patch = parseSpecPatch(data.choices?.[0]?.message?.content ?? "");
  return { spec: ensureReadable(applySpecPatch(input.current, patch)), patch };
}
