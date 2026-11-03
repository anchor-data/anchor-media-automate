import { NotConfiguredError } from "./errors";
import { estimateOpenAiImageCost, logOpenAiImageCost, type OpenAiImageUsage } from "./openai-cost";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images";
const DEFAULT_MODEL = "gpt-image-1";
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export type ReferenceImage = { bytes: Uint8Array; contentType: string; name: string };

export type GenerateSlideImageInput = {
  apiKey?: string;
  prompt: string;
  /** Reference images sent with every request so the subject and style stay consistent. */
  references: readonly ReferenceImage[];
  model?: string;
  /** Names this image in the dev cost log, e.g. "image s2_image". */
  label?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export type GeneratedImage = {
  bytes: Uint8Array;
  contentType: "image/png";
  /** Estimated cost from the usage OpenAI reports; null when unknown. */
  costUsd: number | null;
};

/**
 * Fixed rules first (subject, look, palette, background... whatever the account wants held constant),
 * then only the scene changes per slide (same idea as the lifestack image-prompts CSVs).
 */
export function composeImagePrompt(stylePrompt: string, scene: string): string {
  const style = stylePrompt.trim();
  return [
    style ? `Apply these rules to every image, unchanged: ${style}` : null,
    "Any reference images show the intended subject and visual style: match them (same subject design, rendering style, color palette).",
    "No text, captions or watermarks in the image.",
    `Scene: ${scene.trim()}`
  ]
    .filter((part): part is string => part !== null)
    .join("\n");
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/** One illustration from OpenAI's image API, with reference images when given. Retries transient errors. */
export async function generateSlideImage(input: GenerateSlideImageInput): Promise<GeneratedImage> {
  if (!input.apiKey) throw new NotConfiguredError("OpenAI image generation");
  const fetchImpl = input.fetchImpl ?? ((url, init) => fetch(url, init));
  const sleep = input.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const model = input.model ?? DEFAULT_MODEL;

  const buildRequest = (): { url: string; init: RequestInit } => {
    const common = { model, background: "auto", output_format: "png", size: "1024x1024", n: "1" };
    if (input.references.length === 0) {
      return {
        url: `${OPENAI_IMAGES_URL}/generations`,
        init: {
          method: "POST",
          headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...common, prompt: input.prompt })
        }
      };
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(common)) form.append(key, value);
    form.append("prompt", input.prompt);
    for (const ref of input.references) {
      form.append("image[]", new Blob([new Uint8Array(ref.bytes)], { type: ref.contentType }), ref.name);
    }
    return {
      url: `${OPENAI_IMAGES_URL}/edits`,
      init: { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}` }, body: form }
    };
  };

  let lastError = new Error("No attempts made");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(2 ** attempt * 1000);
    const { url, init } = buildRequest();
    const response = await fetchImpl(url, init);
    if (!response.ok) {
      lastError = new Error(`OpenAI image generation failed (${response.status}): ${await response.text()}`);
      if (RETRYABLE_STATUS.has(response.status)) continue;
      throw lastError;
    }
    const data = (await response.json()) as { data?: Array<{ b64_json?: string }>; usage?: OpenAiImageUsage };
    const encoded = data.data?.[0]?.b64_json;
    if (!encoded) throw new Error("OpenAI image generation returned no image");
    logOpenAiImageCost(input.label ?? "image", model, data.usage);
    return {
      bytes: fromBase64(encoded),
      contentType: "image/png",
      costUsd: estimateOpenAiImageCost(model, data.usage)?.usd ?? null
    };
  }
  throw lastError;
}
