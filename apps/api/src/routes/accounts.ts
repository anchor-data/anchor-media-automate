import { Hono } from "hono";
import { chatCostUsd } from "@ama/integrations";
import {
  DEFAULT_DESIGN_SPEC,
  ensureReadable,
  specForRole,
  designSpecSchema,
  normalizeStructure,
  requestDesignFromReferences,
  requestStructureFromReferences
} from "@ama/renderer";
import type { Account, AccountDesign } from "@ama/shared";
import { accountDesignSchema, autoRunSettingsSchema, deckStructureSchema, roleOf } from "@ama/shared";
import { z } from "zod";
import { createRepo, type Bindings } from "../lib/env";
import {
  backgroundKey,
  deleteBackgrounds,
  isBackgroundName,
  isSlideRole,
  listBackgrounds,
  regenerateRoleBackgrounds
} from "../lib/design-backgrounds";
import {
  addDesignReference,
  deleteDesignReferences,
  designReferenceKey,
  isDesignReferenceName,
  listDesignReferences,
  loadDesignReferenceFiles,
  loadDesignReferenceImages,
  replaceDesignReferences,
  setDesignReferencePage,
  type ReferenceScreenshot
} from "../lib/design-references";
import { imageAssetKey } from "../lib/image-assets";

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

/** Delete an account and everything that belongs to it. Uploaded image files are removed from R2 too. */
accountRoutes.delete("/accounts/:id", async (c) => {
  const repo = createRepo(c.env);
  const id = c.req.param("id");
  const images = await repo.listImageAssets(id, ["asset", "reference", "generated"]);
  if (!(await repo.deleteAccount(id))) return c.json({ error: "Account not found" }, 404);
  await Promise.all(images.map((image) => c.env.IMAGE_ASSETS?.delete(imageAssetKey(image.id))));
  if (c.env.IMAGE_ASSETS) {
    await deleteDesignReferences(c.env.IMAGE_ASSETS, id);
    await deleteBackgrounds(c.env.IMAGE_ASSETS, id);
  }
  return c.json({ ok: true });
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
  // Re-check readability on the way out, so designs saved before the check was fixed show correctly too.
  return { ...stored, spec: ensureReadable(parsed.success ? parsed.data : DEFAULT_DESIGN_SPEC), hasDesign: stored.spec !== null };
}

accountRoutes.get("/accounts/:id/design", async (c) => {
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);
  return c.json({ design: designView(account.design) });
});

const MAX_DESIGN_REFERENCES = 8;
/** References sent to the image model with each background request (each one adds input cost). */
const MAX_BACKGROUND_REFERENCES = 4;

/** The screenshots the current design was derived from (kept in the image bucket). */
accountRoutes.get("/accounts/:id/design/references", async (c) => {
  const bucket = c.env.IMAGE_ASSETS;
  if (!bucket) return c.json({ items: [], enabled: false });
  return c.json({ items: await listDesignReferences(bucket, c.req.param("id")), enabled: true });
});

accountRoutes.get("/accounts/:id/design/references/:name", async (c) => {
  const name = c.req.param("name");
  const bucket = c.env.IMAGE_ASSETS;
  if (!bucket || !isDesignReferenceName(name)) return c.json({ error: "Image not found" }, 404);
  const object = await bucket.get(designReferenceKey(c.req.param("id"), name));
  if (!object) return c.json({ error: "Image not found" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600"
    }
  });
});

/** Attach one reference screenshot (image data URL) to a page of the carousel. */
accountRoutes.post("/accounts/:id/design/references", async (c) => {
  const bucket = c.env.IMAGE_ASSETS;
  if (!bucket) return c.json({ error: "Image storage (R2 IMAGE_ASSETS) is not configured" }, 503);
  const parsed = z
    .object({ screenshot: screenshotSchema.refine((value) => value.startsWith("data:image/"), "image data URL"), page: z.number().int().min(0).max(10).default(0), palette: z.string().max(200).default("") })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const accountId = c.req.param("id");
  if ((await listDesignReferences(bucket, accountId)).length >= MAX_DESIGN_REFERENCES) {
    return c.json({ error: `参考画像は最大${MAX_DESIGN_REFERENCES}枚までです` }, 409);
  }
  const item = await addDesignReference(bucket, accountId, parsed.data.screenshot, parsed.data.page || null, parsed.data.palette);
  if (!item) return c.json({ error: "Not an image" }, 400);
  return c.json({ item }, 201);
});

/** Say which page of the carousel a saved reference shows (0 clears it). The file is renamed, so the new name comes back. */
accountRoutes.patch("/accounts/:id/design/references/:name", async (c) => {
  const name = c.req.param("name");
  const bucket = c.env.IMAGE_ASSETS;
  const parsed = z.object({ page: z.number().int().min(0).max(10) }).safeParse(await c.req.json().catch(() => null));
  if (!bucket || !isDesignReferenceName(name) || !parsed.success) return c.json({ error: "Invalid request" }, 400);
  const next = await setDesignReferencePage(bucket, c.req.param("id"), name, parsed.data.page || null);
  if (!next) return c.json({ error: "Image not found" }, 404);
  return c.json({ item: { name: next, page: parsed.data.page || null } });
});

accountRoutes.delete("/accounts/:id/design/references/:name", async (c) => {
  const name = c.req.param("name");
  const bucket = c.env.IMAGE_ASSETS;
  if (!bucket || !isDesignReferenceName(name)) return c.json({ error: "Image not found" }, 404);
  await bucket.delete(designReferenceKey(c.req.param("id"), name));
  return c.json({ ok: true });
});

/** Background artwork of the design (generated from the references, one set of variants per page role). */
accountRoutes.get("/accounts/:id/design/backgrounds", async (c) => {
  const bucket = c.env.IMAGE_ASSETS;
  if (!bucket) return c.json({ items: [], enabled: false });
  return c.json({ items: await listBackgrounds(bucket, c.req.param("id")), enabled: true });
});

accountRoutes.get("/accounts/:id/design/backgrounds/:name", async (c) => {
  const name = c.req.param("name");
  const bucket = c.env.IMAGE_ASSETS;
  if (!bucket || !isBackgroundName(name)) return c.json({ error: "Image not found" }, 404);
  const object = await bucket.get(backgroundKey(c.req.param("id"), name));
  if (!object) return c.json({ error: "Image not found" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable"
    }
  });
});

/** Generate the artwork variants of one page role from the saved references and the current design colors. */
accountRoutes.post("/accounts/:id/design/backgrounds/:role", async (c) => {
  const role = c.req.param("role");
  if (!isSlideRole(role)) return c.json({ error: "Unknown page role" }, 400);
  const bucket = c.env.IMAGE_ASSETS;
  if (!bucket) return c.json({ error: "Image storage (R2 IMAGE_ASSETS) is not configured" }, 503);
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);
  if (!account.design?.spec) return c.json({ error: "先にデザインを作成してください" }, 409);

  // The artwork matches this kind of page's own colors (a cover may use a darker panel than the content pages).
  const { theme } = specForRole(designView(account.design).spec, role);
  // References that show this role's page come first: the artwork should follow them most closely.
  const files = await loadDesignReferenceFiles(bucket, account.id);
  const structure = account.design.structure;
  const isThisRole = (page: number | null) => page !== null && roleOf(structure, page) === role;
  const matchingFiles = files.filter((file) => isThisRole(file.page));
  const references = [...matchingFiles, ...files.filter((file) => !isThisRole(file.page))].slice(0, MAX_BACKGROUND_REFERENCES);
  const matching = Math.min(matchingFiles.length, references.length);
  try {
    const result = await regenerateRoleBackgrounds({
      bucket,
      apiKey: c.env.OPENAI_API_KEY,
      accountId: account.id,
      role,
      references,
      matching,
      palette: { background: theme.bg, panel: theme.card, heading: theme.primary, accent: theme.accent, bar: theme.bar }
    });
    await repo.updateAccountDesign(account.id, {
      ...account.design,
      analysisCostUsd: account.design.analysisCostUsd + result.costUsd
    });
    return c.json({ items: await listBackgrounds(bucket, account.id), costUsd: result.costUsd });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Could not generate the background" }, 502);
  }
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
      /** Page of the carousel each new screenshot shows (0 = not said), same order as `screenshots`. */
      screenshotPages: z.array(z.number().int().min(0).max(10)).max(10).default([]),
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
  // Saved references stay part of the design: new screenshots are added to them (newest kept, up to 8).
  const saved = c.env.IMAGE_ASSETS ? await loadDesignReferenceImages(c.env.IMAGE_ASSETS, account.id).catch(() => []) : [];
  const added: ReferenceScreenshot[] = parsed.data.screenshots.map((src, index) => ({ src, page: parsed.data.screenshotPages[index] || null }));
  const references = [...saved, ...added].slice(-MAX_DESIGN_REFERENCES);
  const images = references.map((reference) => reference.src);
  let result;
  try {
    result = await requestDesignFromReferences({
      apiKey: c.env.OPENAI_API_KEY,
      images,
      pages: references.map((reference) => reference.page),
      palettes: references.map((reference) => reference.palette ?? ""),
      structure: current.structure,
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
  // Remember what this design was based on so the page can show it. Best effort: the design is already saved.
  if (c.env.IMAGE_ASSETS && parsed.data.screenshots.length > 0) {
    await replaceDesignReferences(c.env.IMAGE_ASSETS, account.id, references).catch((error: unknown) => {
      console.error(`could not save design references for ${account.id}: ${error instanceof Error ? error.message : error}`);
    });
  }
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
