import { Hono } from "hono";
import { missingTemplateFields, type CanvaClient } from "@ama/integrations";
import type { Account } from "@ama/shared";
import { autoRunSettingsSchema } from "@ama/shared";
import { z } from "zod";
import { createCanva, createRepo, type Bindings } from "../lib/env";

export const accountRoutes = new Hono<{ Bindings: Bindings }>();

type TemplateCheck = { ok: true } | { ok: false; error: string; missing?: string[] };

/** A brand template is usable only if it exposes every s1_* … s8_* autofill field. */
async function checkTemplate(canva: CanvaClient, templateId: string): Promise<TemplateCheck> {
  let fields: string[];
  try {
    fields = await canva.getTemplateFieldNames(templateId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unexpected error";
    return { ok: false, error: `Could not read the template: ${reason}` };
  }
  const missing = missingTemplateFields(fields);
  return missing.length > 0
    ? { ok: false, error: `Template is missing autofill fields: ${missing.join(", ")}`, missing }
    : { ok: true };
}

accountRoutes.post("/accounts", async (c) => {
  const bodySchema = z.object({
    name: z.string().min(1),
    instagramHandle: z.string().min(1),
    tone: z.string().default(""),
    canvaTemplateId: z.string().min(1)
  });
  const parsed = bodySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const check = await checkTemplate(createCanva(c.env, repo), parsed.data.canvaTemplateId);
  if (!check.ok) return c.json(check, 422);

  const account: Account = { id: `acc_${crypto.randomUUID()}`, ...parsed.data };
  return c.json({ item: await repo.createAccount(account), mode: repo.mode }, 201);
});

/** Select the brand template an account renders with. */
accountRoutes.put("/accounts/:id/canva-template", async (c) => {
  const parsed = z.object({ templateId: z.string().min(1) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const repo = createRepo(c.env);
  const account = await repo.getAccount(c.req.param("id"));
  if (!account) return c.json({ error: "Account not found" }, 404);

  const check = await checkTemplate(createCanva(c.env, repo), parsed.data.templateId);
  if (!check.ok) return c.json(check, 422);
  const item = await repo.updateAccountTemplate(account.id, parsed.data.templateId);
  return c.json({ item, mode: repo.mode });
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
