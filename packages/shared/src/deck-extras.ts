import { z } from "zod";
import type { SlideFields, SlideImage } from "./index";

/**
 * An account's design, as stored. `spec` is the renderer's DesignSpec kept opaque here (the renderer
 * owns and validates its shape); it is null until a design has been created from references.
 */
export const accountDesignSchema = z.object({
  spec: z.record(z.string(), z.unknown()).nullable().default(null),
  /** Written design guideline the owner added next to the reference screenshots. */
  guideline: z.string().max(4000).default(""),
  /** Where the references came from (an Instagram handle/link). A note only: it is never fetched. */
  referenceNote: z.string().max(500).default(""),
  /** The AI's one-line description of the design it derived. */
  summary: z.string().max(1000).default(""),
  updatedAt: z.string().nullable().default(null)
});
export type AccountDesign = z.infer<typeof accountDesignSchema>;

const imageListSchema = z.array(z.object({ slot: z.string().regex(/^s[1-8]_image$/), assetId: z.string().min(1) }));

export interface DeckExtras {
  images: SlideImage[];
  /** The design this post was rendered with (the account design plus its per-post variation); null before the first render. */
  design: Record<string, unknown> | null;
  /** The last free-text request used to regenerate this post's design. */
  designPrompt: string;
}

/**
 * `posts.slides_json` carries more than the 21 text fields: chosen images, the design the post was
 * rendered with, and the prompt that produced it. Read them with safe fallbacks.
 */
export function deckExtrasFrom(slidesJson: unknown): DeckExtras {
  const raw = (slidesJson ?? {}) as Record<string, unknown>;
  const images = imageListSchema.safeParse(raw.images);
  const design = z.record(z.string(), z.unknown()).safeParse(raw.design);
  return {
    images: images.success ? (images.data as SlideImage[]) : [],
    design: design.success ? design.data : null,
    designPrompt: typeof raw.designPrompt === "string" ? raw.designPrompt : ""
  };
}

/** Inverse of deckExtrasFrom: the value to store in `posts.slides_json`. */
export function slidesJsonWith(slides: SlideFields, extras: DeckExtras): Record<string, unknown> {
  return {
    ...slides,
    images: extras.images,
    ...(extras.design ? { design: extras.design } : {}),
    ...(extras.designPrompt ? { designPrompt: extras.designPrompt } : {})
  };
}
