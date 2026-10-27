import { Hono } from "hono";
import { validateImageUpload } from "@ama/integrations";
import { IMAGE_ASSET_KINDS, SLIDE_IMAGE_SLOTS } from "@ama/shared";
import { z } from "zod";
import { createCanva, createRepo, type Bindings } from "../lib/env";
import { imageAssetKey } from "../lib/image-assets";

export const imageRoutes = new Hono<{ Bindings: Bindings }>();

imageRoutes.get("/accounts/:id/image-assets", async (c) => {
  const repo = createRepo(c.env);
  return c.json({ items: await repo.listImageAssets(c.req.param("id")), mode: repo.mode });
});

/** Image fields (s1_image …) the account's Canva brand template exposes; images only render into these. */
imageRoutes.get("/accounts/:id/image-slots", async (c) => {
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);
  try {
    const fields = await createCanva(c.env, repo).getTemplateFieldNames(account.canvaTemplateId);
    return c.json({ slots: SLIDE_IMAGE_SLOTS.filter((slot) => fields.includes(slot)) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Could not read the template" }, 502);
  }
});

/** Fixed image rules prepended to every AI-generated slide image. */
imageRoutes.get("/accounts/:id/image-style", async (c) => {
  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);
  return c.json({ prompt: account.imageStylePrompt ?? "" });
});

imageRoutes.put("/accounts/:id/image-style", async (c) => {
  const parsed = z.object({ prompt: z.string().max(2000) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const repo = createRepo(c.env);
  const account = await repo.updateAccountImageStyle(c.req.param("id"), parsed.data.prompt.trim());
  if (!account) return c.json({ error: "Account not found" }, 404);
  return c.json({ prompt: account.imageStylePrompt ?? "" });
});

imageRoutes.post("/accounts/:id/image-assets", async (c) => {
  const bucket = c.env.IMAGE_ASSETS;
  if (!bucket) return c.json({ error: "Image storage (R2 IMAGE_ASSETS) is not configured" }, 503);

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "Missing file field" }, 400);
  const check = validateImageUpload({ contentType: file.type, size: file.size });
  if (!check.ok) return c.json({ error: check.error }, 400);

  const kind = z.enum(IMAGE_ASSET_KINDS).exclude(["generated"]).safeParse(form.get("kind") ?? "asset");
  if (!kind.success) return c.json({ error: "kind must be asset or reference" }, 400);

  const label = String(form.get("label") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
  const description = String(form.get("description") ?? "").trim();

  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);

  const item = await repo.createImageAsset(account.id, {
    label: label.slice(0, 80),
    description: description.slice(0, 500),
    contentType: check.contentType,
    kind: kind.data,
    sizeBytes: file.size
  });
  try {
    await bucket.put(imageAssetKey(item.id), await file.arrayBuffer(), {
      httpMetadata: { contentType: check.contentType }
    });
  } catch (error) {
    await repo.deleteImageAsset(item.id);
    throw error;
  }
  return c.json({ item, mode: repo.mode }, 201);
});

imageRoutes.get("/image-assets/:id/file", async (c) => {
  const bucket = c.env.IMAGE_ASSETS;
  if (!bucket) return c.json({ error: "Image storage (R2 IMAGE_ASSETS) is not configured" }, 503);
  const object = await bucket.get(imageAssetKey(c.req.param("id")));
  if (!object) return c.json({ error: "Image not found" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600"
    }
  });
});

imageRoutes.delete("/image-assets/:id", async (c) => {
  const repo = createRepo(c.env);
  const ok = await repo.deleteImageAsset(c.req.param("id"));
  if (!ok) return c.json({ error: "Image not found" }, 404);
  await c.env.IMAGE_ASSETS?.delete(imageAssetKey(c.req.param("id")));
  return c.json({ ok: true });
});
