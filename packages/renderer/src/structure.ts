import { DEFAULT_STRUCTURE, MAX_SLIDES, MIN_SLIDES, SLIDE_ROLES, type SlideRole } from "@ama/shared";
import { parseSpecPatch, usageOf, type ChatResponse, type ModelUsage } from "./nl";

const MODEL = "gpt-4.1";
const roles = new Set<string>(SLIDE_ROLES);

/**
 * Turn any list of roles (a model's guess, a user's edit) into a valid structure: unknown roles are
 * dropped, the cover is first, the CTA is last (neither appears in the middle), there is at least one
 * point page, and the length is 3-10 (surplus middle pages are dropped).
 */
export function normalizeStructure(input: readonly string[]): SlideRole[] {
  const middle = input.filter((role): role is SlideRole => roles.has(role) && role !== "cover" && role !== "cta");
  const kept = middle.slice(0, MAX_SLIDES - 2);
  // A point page must survive the cut: it replaces the last kept page when none made it.
  if (!kept.includes("point")) {
    if (kept.length >= MAX_SLIDES - 2) kept.pop();
    kept.push("point");
  }
  return ["cover", ...kept, "cta"];
}

/** Prompt for deriving the page structure of a carousel from reference screenshots. */
export function buildStructurePrompt(): string {
  return `The attached images are the pages of reference Instagram carousel posts (several posts may be mixed). Work out the page structure the account uses for one post, as an ordered list of page roles.

Roles:
- "cover": the first page, the title/hook.
- "empathy": a page that names the reader's problem or worry.
- "point": a numbered know-how/tip page (number, heading, short text). Repeat it once per tip.
- "pick": a recommendation / summary / pick page.
- "cta": the last page, a call to action (follow / save).

Rules: the first page is a cover, the last is a cta, there is at least one point page, ${MIN_SLIDES} to ${MAX_SLIDES} pages in total. If the references show posts of different lengths, choose the typical one.

Return ONLY a JSON object: {"summary": "one sentence in Japanese, e.g. 7枚: 共感のあと要点を4つ", "pages": ["cover", ...]}`;
}

export interface StructureRequest {
  apiKey?: string;
  /** Screenshots as data URLs or https URLs. */
  images: readonly string[];
  fetchImpl?: typeof fetch;
}

/** Reference screenshots -> the page structure (always valid). Falls back to the default 8 pages. */
export async function requestStructureFromReferences(
  input: StructureRequest
): Promise<{ structure: SlideRole[]; summary: string; usage: ModelUsage | undefined }> {
  if (input.images.length === 0) throw new Error("Add reference screenshots to infer the page structure");
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
            { type: "text", text: buildStructurePrompt() },
            ...input.images.map((url) => ({ type: "image_url", image_url: { url, detail: "auto" } }))
          ]
        }
      ]
    })
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
  const data = (await response.json()) as ChatResponse;
  const parsed = parseSpecPatch(data.choices?.[0]?.message?.content ?? "");
  const pages = Array.isArray(parsed.pages) ? parsed.pages.filter((page): page is string => typeof page === "string") : [];
  const known = pages.filter((page) => roles.has(page));
  return {
    structure: known.length > 0 ? normalizeStructure(known) : [...DEFAULT_STRUCTURE],
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    usage: usageOf(MODEL, data)
  };
}
