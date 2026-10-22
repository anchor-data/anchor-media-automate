import { TEMPLATE_PAGE_HEIGHT, TEMPLATE_PAGE_WIDTH } from "./canva";
import {
  DEFAULT_TEMPLATE_STRUCTURE,
  type TemplateStructure
} from "./template-structure";

export type TemplateBriefField = { name: string; maxChars: number };
export type TemplateBriefPage = { page: number; title: string; purpose: string; fields: TemplateBriefField[] };

export type TemplateBriefInput = {
  /** Instagram profile url or @handle the style is inspired by. */
  referenceUrl: string;
  assetUrls: readonly string[];
  styleNotes: string;
  /** Page layout inferred from the reference; defaults to the fixed 8-page deck. */
  structure?: TemplateStructure;
};

export type TemplateBrief = {
  referenceHandle: string | null;
  pages: TemplateBriefPage[];
  markdown: string;
};

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;
const NON_PROFILE_SEGMENTS = new Set(["p", "reel", "reels", "stories", "explore", "tv"]);

/** Profile handle from an instagram.com url or `@handle`; null for post urls and other hosts. */
export function parseInstagramHandle(input: string): string | null {
  const value = input.trim();
  if (value.startsWith("@")) {
    const handle = value.slice(1);
    return HANDLE_RE.test(handle) ? handle : null;
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!INSTAGRAM_HOSTS.has(url.host.toLowerCase())) return null;
  const [segment] = url.pathname.split("/").filter(Boolean);
  if (!segment || NON_PROFILE_SEGMENTS.has(segment) || !HANDLE_RE.test(segment)) return null;
  return segment;
}

function renderMarkdown(
  input: TemplateBriefInput,
  handle: string | null,
  pages: readonly TemplateBriefPage[]
): string {
  const reference = handle ? `@${handle} (${input.referenceUrl.trim()})` : input.referenceUrl.trim();
  const assets = input.assetUrls.length > 0 ? input.assetUrls.map((url) => `- ${url}`) : ["- (none provided)"];
  const lines = [
    "# Canva brand template brief",
    "",
    `Canvas: ${TEMPLATE_PAGE_WIDTH}×${TEMPLATE_PAGE_HEIGHT} (4:5), ${pages.length} pages.`,
    `Reference account: ${reference}`,
    `Style notes: ${input.styleNotes.trim() || "(none)"}`,
    "",
    "## Assets to use",
    ...assets,
    "",
    "## Pages and autofill fields",
    ...pages.flatMap((page) => [
      `${page.page}. ${page.title} - ${page.purpose}`,
      ...page.fields.map((field) => `   - \`${field.name}\` (max ${field.maxChars} chars)`)
    ]),
    "",
    "## Finish in Canva",
    "1. Lay out the pages above in the reference style. Use original visuals only: no third-party logos or characters.",
    "2. Make every field above its own text box, big enough for its character limit.",
    "3. Name each text box with the Data autofill app, using the exact field names.",
    "4. Publish the design as a brand template (Canva Enterprise).",
    "5. Back in the app, refresh the template list and select the new template."
  ];
  return lines.join("\n");
}

/** Deterministic checklist for a human (or Canva's editor) to turn the draft into a brand template. */
export function buildTemplateBrief(input: TemplateBriefInput): TemplateBrief {
  const handle = parseInstagramHandle(input.referenceUrl);
  const pages = (input.structure ?? DEFAULT_TEMPLATE_STRUCTURE).pages.map((page, index) => ({
    page: index + 1,
    title: page.title,
    purpose: page.purpose,
    fields: page.fields.map((field) => ({ name: field.name, maxChars: field.maxChars }))
  }));
  return { referenceHandle: handle, pages, markdown: renderMarkdown(input, handle, pages) };
}
