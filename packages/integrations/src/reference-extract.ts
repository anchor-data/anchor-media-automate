import type { ReferenceCreate } from "@ama/shared";
import { z } from "zod";
import { NotConfiguredError } from "./errors";

const MAX_SCREENSHOTS = 10;
const MAX_HOOKS = 5;
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const VISION_MODEL = "gpt-4.1";

const entrySchema = z.object({ title: z.string().min(1).max(60), text: z.string().min(1).max(600) });
const outputSchema = z.object({
  hooks: z.array(entrySchema).min(1).max(MAX_HOOKS),
  slidePattern: entrySchema,
  voice: entrySchema
});

const SYSTEM_PROMPT = [
  "You study screenshots of an Instagram career/job-change carousel and extract reusable PATTERNS for an original account.",
  "Return JSON: {\"hooks\":[{\"title\":string,\"text\":string}],\"slidePattern\":{\"title\":string,\"text\":string},\"voice\":{\"title\":string,\"text\":string}}.",
  `hooks: up to ${MAX_HOOKS} hook formulas seen on the cover slides. title names the formula (e.g. 手順系フック); text is a PARAPHRASED example headline.`,
  "slidePattern: the role of each slide in order, one short line (e.g. 1枚目で悩みを一言フック → 2枚目で共感 → …).",
  "voice: describe the tone (sentence endings, person, how jargon is handled) in your own words, with no quotes from the slides.",
  "Write in Japanese. Never copy slide text, brand names, characters or catchphrases verbatim: paraphrase so nothing can be mistaken for the original."
].join(" ");

export type ExtractReferenceInput = {
  /** Instagram handle the screenshots came from; only used as context for the model. */
  handle: string;
  /** Image data URLs or https URLs of reference carousel slides. */
  screenshots: readonly string[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Hook / slide-structure / voice references read from screenshots of a reference account's
 * carousels by a vision model. Instagram has no public API to fetch posts, so screenshots are the input.
 */
export async function extractReferencePatterns(input: ExtractReferenceInput): Promise<ReferenceCreate[]> {
  if (!input.apiKey) throw new NotConfiguredError("OpenAI vision");
  const screenshots = input.screenshots.slice(0, MAX_SCREENSHOTS);
  if (screenshots.length === 0) throw new Error("At least one screenshot is required");

  const fetchImpl = input.fetchImpl ?? ((url, init) => fetch(url, init));
  const response = await fetchImpl(OPENAI_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `${screenshots.length} screenshots from ${input.handle}.` },
            ...screenshots.map((url) => ({ type: "image_url", image_url: { url } }))
          ]
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`OpenAI reference extraction failed (${response.status}): ${await response.text()}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI reference extraction returned no content");
  const output = outputSchema.parse(JSON.parse(content));

  const sourceNote = `instagram: ${input.handle}`;
  const make = (kind: ReferenceCreate["kind"], entry: z.infer<typeof entrySchema>): ReferenceCreate => ({
    kind,
    title: entry.title,
    sourceNote,
    examplesText: entry.text,
    active: true
  });
  return [
    ...output.hooks.map((hook) => make("hook_pattern", hook)),
    make("slide_pattern", output.slidePattern),
    make("voice_sample", output.voice)
  ];
}
