import { Hono } from "hono";
import { chatCostUsd } from "@ama/integrations";
import {
  DEFAULT_DESIGN_SPEC,
  designSpecSchema,
  normalizeStructure,
  requestDesignFromReferences,
  requestStructureFromReferences
} from "@ama/renderer";
import type { Account, AccountDesign } from "@ama/shared";
import { accountDesignSchema, autoRunSettingsSchema, deckStructureSchema } from "@ama/shared";
import { z } from "zod";
import { createRepo, type Bindings } from "../lib/env";

export const accountRoutes = new Hono<{ Bindings: Bindings }>();

accountRoutes.post("/accounts", async (c) => {
  const bodySchema = z.object({
    name: z.string().min(1),
    instagramHandle: z.string().min(1),
    tone: z.string().default("")
  });
  const parsed = bodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const account: Account = { id: `acc_${crypto.randomUUID()}`, ...parsed.data };
  return c.json({ item: await repo.createAccount(account), mode: repo.mode }, 201);
});

/** Enable/disable the periodic ideation + content run and pick its schedule. */
accountRoutes.put("/accounts/:id/auto-run", async (c) => {
  const parsed = autoRunSettingsSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const item = await repo.updateAccountAutoRun(c.req.param("id"), parsed.data);
  if (!item) return c.json({ error: "Account not found" }, 404);
  return c.json({ item, mode: repo.mode });
});

/** What the design page shows: the account's design with its spec resolved to a full, valid design. */
function designView(design: AccountDesign | undefined) {
  const stored = design ?? accountDesignSchema.parse({});
  const parsed = designSpecSchema.safeParse(stored.spec ?? {});
  return { ...stored, spec: parsed.success ? parsed.data : DEFAULT_DESIGN_SPEC, hasDesign: stored.spec !== null };
}

accountRoutes.get("/accounts/:id/design", async (c) => {
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);
  return c.json({ design: designView(account.design) });
});

/** Reference screenshots: image data URLs or https URLs. */
const screenshotSchema = z.string().refine((value) => value.startsWith("data:image/") || value.startsWith("https://"), "image data URL or https URL");

/**
 * Save the written guideline and the reference note without re-deriving the design. (The design
 * itself is only changed by analyze, so a typo fix in the guideline never throws the look away.)
 */
accountRoutes.put("/accounts/:id/design", async (c) => {
  const parsed = z
    .object({ guideline: z.string().max(4000).optional(), referenceNote: z.string().max(500).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);

  const current = account.design ?? accountDesignSchema.parse({});
  const next: AccountDesign = {
    ...current,
    guideline: parsed.data.guideline ?? current.guideline,
    referenceNote: parsed.data.referenceNote ?? current.referenceNote,
    updatedAt: new Date().toISOString()
  };
  const updated = await repo.updateAccountDesign(account.id, next);
  return c.json({ design: designView(updated?.design) });
});

/**
 * Create the account's design from reference screenshots plus the written guideline. The reference
 * link is kept as a note only: Instagram content is never fetched, only what the user uploads.
 */
accountRoutes.post("/accounts/:id/design/analyze", async (c) => {
  const parsed = z
    .object({
      screenshots: z.array(screenshotSchema).max(10).default([]),
      guideline: z.string().max(4000).optional(),
      referenceNote: z.string().max(500).optional()
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);

  const current = account.design ?? accountDesignSchema.parse({});
  const guideline = parsed.data.guideline ?? current.guideline;
  const referenceNote = parsed.data.referenceNote ?? current.referenceNote;
  let result;
  try {
    result = await requestDesignFromReferences({
      apiKey: c.env.OPENAI_API_KEY,
      images: parsed.data.screenshots,
      guideline,
      referenceNote
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Could not create the design" }, 502);
  }

  const design: AccountDesign = {
    ...current,
    spec: result.spec,
    guideline,
    referenceNote,
    summary: result.summary,
    updatedAt: new Date().toISOString(),
    analysisCostUsd: current.analysisCostUsd + (result.usage ? (chatCostUsd(result.usage.model, result.usage) ?? 0) : 0)
  };
  const updated = await repo.updateAccountDesign(account.id, design);
  return c.json({ design: designView(updated?.design) });
});

/**
 * Infer the account's page structure (how many pages, which roles) from reference screenshots and
 * save it as the account's structure. The owner can adjust it afterwards (PUT .../structure).
 */
accountRoutes.post("/accounts/:id/structure/analyze", async (c) => {
  const parsed = z.object({ screenshots: z.array(screenshotSchema).min(1).max(10) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);

  let result;
  try {
    result = await requestStructureFromReferences({ apiKey: c.env.OPENAI_API_KEY, images: parsed.data.screenshots });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Could not infer the structure" }, 502);
  }
  const current = account.design ?? accountDesignSchema.parse({});
  const updated = await repo.updateAccountDesign(account.id, {
    ...current,
    structure: result.structure,
    structureSummary: result.summary,
    updatedAt: new Date().toISOString(),
    analysisCostUsd: current.analysisCostUsd + (result.usage ? (chatCostUsd(result.usage.model, result.usage) ?? 0) : 0)
  });
  return c.json({ design: designView(updated?.design) });
});

/** Set the page structure by hand (3-10 pages, cover first, CTA last, at least one point page). */
accountRoutes.put("/accounts/:id/structure", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { structure?: unknown } | null;
  const parsed = deckStructureSchema.safeParse(body?.structure);
  if (!parsed.success) return c.json({ error: parsed.error.issues.map((issue) => issue.message) }, 400);
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);

  const current = account.design ?? accountDesignSchema.parse({});
  const updated = await repo.updateAccountDesign(account.id, {
    ...current,
    structure: normalizeStructure(parsed.data),
    updatedAt: new Date().toISOString()
  });
  return c.json({ design: designView(updated?.design) });
});
