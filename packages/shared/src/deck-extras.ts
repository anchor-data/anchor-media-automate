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
  updatedAt: z.string().nullable().default(null),
  /** What deriving this design cost (USD), as measured from the model's token usage. */
  analysisCostUsd: z.number().min(0).default(0)
});
export type AccountDesign = z.infer<typeof accountDesignSchema>;

const imageListSchema = z.array(z.object({ slot: z.string().regex(/^s[1-8]_image$/), assetId: z.string().min(1) }));

/** What generating one post cost (USD), by step. Only what was actually measured is added. */
export const postCostSchema = z.object({
  copy: z.number().min(0).default(0),
  images: z.number().min(0).default(0),
  design: z.number().min(0).default(0)
});
export type PostCost = z.infer<typeof postCostSchema>;

/** A new cost record with `amount` added to `step`. Null/negative amounts (unknown model, no usage) are ignored. */
export function addCost(cost: PostCost, step: keyof PostCost, amount: number | null | undefined): PostCost {
  if (amount === null || amount === undefined || !(amount > 0)) return cost;
  return { ...cost, [step]: cost[step] + amount };
}

export const totalCost = (cost: PostCost): number => cost.copy + cost.images + cost.design;

export interface DeckExtras {
  images: SlideImage[];
  /** The design this post was rendered with (the account design plus its per-post variation); null before the first render. */
  design: Record<string, unknown> | null;
  /** The last free-text request used to regenerate this post's design. */
  designPrompt: string;
  costUsd: PostCost;
}

/**
 * `posts.slides_json` carries more than the 21 text fields: chosen images, the design the post was
 * rendered with, and the prompt that produced it. Read them with safe fallbacks.
 */
export function deckExtrasFrom(slidesJson: unknown): DeckExtras {
  const raw = (slidesJson ?? {}) as Record<string, unknown>;
  const images = imageListSchema.safeParse(raw.images);
  const design = z.record(z.string(), z.unknown()).safeParse(raw.design);
  const cost = postCostSchema.safeParse(raw.costUsd);
  return {
    images: images.success ? (images.data as SlideImage[]) : [],
    design: design.success ? design.data : null,
    designPrompt: typeof raw.designPrompt === "string" ? raw.designPrompt : "",
    costUsd: cost.success ? cost.data : postCostSchema.parse({})
  };
}

/** Inverse of deckExtrasFrom: the value to store in `posts.slides_json`. */
export function slidesJsonWith(slides: SlideFields, extras: DeckExtras): Record<string, unknown> {
  return {
    ...slides,
    images: extras.images,
    ...(extras.design ? { design: extras.design } : {}),
    ...(extras.designPrompt ? { designPrompt: extras.designPrompt } : {}),
    ...(totalCost(extras.costUsd) > 0 ? { costUsd: extras.costUsd } : {})
  };
}
