import { Hono } from "hono";
import {
  buildTemplateBrief,
  inferTemplateStructure,
  parseInstagramHandle,
  type TemplateStructure
} from "@ama/integrations";
import { z } from "zod";
import { createCanva, createRepo, type Bindings } from "../lib/env";

export const canvaRoutes = new Hono<{ Bindings: Bindings }>();

canvaRoutes.get("/canva/brand-templates", async (c) => {
  const repo = createRepo(c.env);
  const canva = createCanva(c.env, repo);
  try {
    return c.json({ items: await canva.listBrandTemplates(), mode: canva.mode });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unexpected error" }, 502);
  }
});

const templateDraftSchema = z.object({
  referenceUrl: z
    .string()
    .min(1)
    .refine((value) => parseInstagramHandle(value) !== null, "Enter an Instagram profile url or @handle"),
  assetUrls: z.array(z.string().url()).max(10).default([]),
  styleNotes: z.string().max(1000).default(""),
  /** Slides of one reference carousel, in order (image data URLs or https URLs). */
  screenshots: z
    .array(z.string().refine((value) => value.startsWith("data:image/") || value.startsWith("https://")))
    .max(10)
    .default([])
});

/**
 * Starts a brand template for a new account: a multi-page 4:5 Canva design plus the brief to finish
 * it. Page count and text boxes come from the reference screenshots (default: the 8-page deck).
 * Tagging the autofill fields and publishing still happen in Canva; the account is linked to the
 * published template afterwards through the normal template picker.
 */
canvaRoutes.post("/canva/template-drafts", async (c) => {
  const parsed = templateDraftSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  let structure: TemplateStructure;
  try {
    structure = await inferTemplateStructure({
      screenshots: parsed.data.screenshots,
      apiKey: c.env.OPENAI_API_KEY
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Could not read the screenshots" }, 502);
  }
  const brief = buildTemplateBrief({ ...parsed.data, structure });
  const repo = createRepo(c.env);
  const canva = createCanva(c.env, repo);
  try {
    const draft = await canva.createDraftDesign({
      title: `${brief.referenceHandle ?? "account"} carousel template`,
      structure
    });
    return c.json({ draft, brief, structure, mode: canva.mode }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unexpected error" }, 502);
  }
});
