import { slideFieldsSchema } from "@ama/shared";
import { z } from "zod";

const MAX_PAGES = 10;
const MAX_SCREENSHOTS = 10;
const FIELD_NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const VISION_MODEL = "gpt-4.1";

/** What a text box on a page is for; with the page number it forms the autofill name, e.g. `s3_head`. */
export const FIELD_KINDS = ["title", "sub", "head", "body", "num", "label", "cta"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

const fieldSchema = z.object({
  name: z.string().regex(FIELD_NAME_RE),
  maxChars: z.number().int().min(1).max(200)
});

const pageSchema = z.object({
  title: z.string().min(1).max(40),
  purpose: z.string().max(120),
  fields: z.array(fieldSchema).min(1).max(8)
});

export const templateStructureSchema = z
  .object({ pages: z.array(pageSchema).min(1).max(MAX_PAGES) })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const name of value.pages.flatMap((page) => page.fields.map((field) => field.name))) {
      if (seen.has(name)) ctx.addIssue({ code: "custom", message: `Duplicate field name: ${name}` });
      seen.add(name);
    }
  });

export type TemplateStructure = z.infer<typeof templateStructureSchema>;
export type TemplateStructurePage = TemplateStructure["pages"][number];

export function parseTemplateStructure(input: unknown): TemplateStructure {
  return templateStructureSchema.parse(input);
}

export function structureFieldNames(structure: TemplateStructure): string[] {
  return structure.pages.flatMap((page) => page.fields.map((field) => field.name));
}

const DEFAULT_PAGES: ReadonlyArray<{ title: string; purpose: string; fields: readonly string[] }> = [
  { title: "Cover", purpose: "Hook: big title and one-line subtitle", fields: ["s1_title", "s1_sub"] },
  { title: "Empathy", purpose: "Name the reader's worry", fields: ["s2_head", "s2_body"] },
  { title: "Point 1", purpose: "Numbered point", fields: ["s3_num", "s3_head", "s3_body"] },
  { title: "Point 2", purpose: "Numbered point (same layout as Point 1)", fields: ["s4_num", "s4_head", "s4_body"] },
  { title: "Point 3", purpose: "Numbered point (same layout as Point 1)", fields: ["s5_num", "s5_head", "s5_body"] },
  { title: "Point 4", purpose: "Numbered point (same layout as Point 1)", fields: ["s6_num", "s6_head", "s6_body"] },
  {
    title: "Hybrid",
    purpose: "Job pick or summary: small label tag, heading, body",
    fields: ["s7_label", "s7_head", "s7_body"]
  },
  { title: "CTA", purpose: "Save / follow call to action", fields: ["s8_head", "s8_cta"] }
];

function slideFieldLimit(name: string): number {
  const shape = slideFieldsSchema.shape as Record<string, { maxLength: number | null }>;
  const limit = shape[name]?.maxLength;
  if (limit == null) throw new Error(`No character limit defined for field ${name}`);
  return limit;
}

/** The fixed 8-page / 21-field deck the creation agent currently writes. */
export const DEFAULT_TEMPLATE_STRUCTURE: TemplateStructure = parseTemplateStructure({
  pages: DEFAULT_PAGES.map((page) => ({
    title: page.title,
    purpose: page.purpose,
    fields: page.fields.map((name) => ({ name, maxChars: slideFieldLimit(name) }))
  }))
});

const modelOutputSchema = z.object({
  pages: z
    .array(
      z.object({
        title: z.string(),
        purpose: z.string(),
        fields: z.array(z.object({ kind: z.enum(FIELD_KINDS), maxChars: z.number().int() }))
      })
    )
    .min(1)
});

const SYSTEM_PROMPT = [
  "You read screenshots of ONE Instagram carousel, in slide order, and describe its page structure.",
  "Return JSON: {\"pages\":[{\"title\":string,\"purpose\":string,\"fields\":[{\"kind\":string,\"maxChars\":number}]}]}.",
  `One entry per slide, at most ${MAX_PAGES}. title is a short role name (Cover, Point, CTA...). purpose is one line.`,
  `Each fields entry is one text box that changes per post. kind is one of: ${FIELD_KINDS.join(", ")}.`,
  "title=big cover title, sub=subtitle, head=heading, body=paragraph, num=big step number, label=small tag, cta=button text.",
  "maxChars is how many characters fit the text box (Japanese counts per character); keep numbers at 2.",
  "Use each kind at most once per page. Ignore logos, handles and page counters: those are static."
].join(" ");

export type InferStructureInput = {
  /** Image data URLs or https URLs of the reference carousel slides, in order. */
  screenshots: readonly string[];
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

function toStructure(output: z.infer<typeof modelOutputSchema>): TemplateStructure {
  return parseTemplateStructure({
    pages: output.pages.map((page, index) => ({
      title: page.title.slice(0, 40) || `Page ${index + 1}`,
      purpose: page.purpose.slice(0, 120),
      fields: page.fields.map((field) => ({
        name: `s${index + 1}_${field.kind}`,
        maxChars: Math.min(200, Math.max(1, field.maxChars))
      }))
    }))
  });
}

/**
 * Page count, roles and text boxes of the reference carousel, read from screenshots by a vision
 * model. Without an API key or screenshots it returns the default 8-page structure.
 */
export async function inferTemplateStructure(input: InferStructureInput): Promise<TemplateStructure> {
  const screenshots = input.screenshots.slice(0, MAX_SCREENSHOTS);
  if (!input.apiKey || screenshots.length === 0) return DEFAULT_TEMPLATE_STRUCTURE;

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
            { type: "text", text: `${screenshots.length} slides of the reference carousel, in order.` },
            ...screenshots.map((url) => ({ type: "image_url", image_url: { url } }))
          ]
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`OpenAI structure inference failed (${response.status}): ${await response.text()}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI structure inference returned no content");
  return toStructure(modelOutputSchema.parse(JSON.parse(content)));
}
