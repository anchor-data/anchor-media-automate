import { Hono } from "hono";
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
