# Feature: Content Creation

## Purpose

Turn a selected **idea** into an Instagram carousel draft: 8 slides of copy + caption/hashtags, rendered via Canva Autofill, then reviewed in the dashboard through **承認 → 予約**.

## Scope

**In**

- Creation agent builds a hybrid 8-slide deck @ 4:5
- Canva autofill + multi-page PNG export (or mock placeholders)
- Preview, edit, regenerate
- Approve / reject / schedule
- Memory writes on approve / reject

**Out**

- Instagram Graph publish (later)
- Metrics / analytics UI

## Post anatomy

- `idea_id` — provenance
- `post_type` — `knowhow` | `job_pick` (hybrid template; slide 7 switches)
- `slides_json` — validated 8-slide payload
- `caption`, `hashtags`
- `status` + `generation_status`
- `post_assets` — one row per slide (Canva design id + export URL)

## 8-slide schema (hybrid)

| # | Role | Notes |
|---|---|---|
| 1 | Cover / hook | title, sub |
| 2 | Empathy / problem | head, body |
| 3–6 | Know-how ×4 | num, head, body |
| 7 | Job pick **or** summary fallback | same layout fields |
| 8 | CTA | head, cta (+ handle from account) |

Character limits are enforced in `@ama/shared` (`slideDeckSchema`). See `canva-template-spec.md` for Canva field names.

**Slide 7 rule (default):** if idea has `job_id` and guideline `job_pick_enabled`, fill job fields; otherwise summary/checklist fallback.

## Status machine

**Post status**

`draft` → `approved` → `scheduled` → `published` (publish later)  
Side: `rejected`, `failed`

**Generation status** (orthogonal)

`pending` → `generating_copy` → `rendering` → `ready` | `failed`

## Creation agent tools

| Tool | Role |
|---|---|
| `get_idea(ideaId)` | Selected idea |
| `get_guideline` / `list_references` | Context |
| `get_job(jobId)?` | Optional |
| `submit_deck(slides, caption, hashtags)` | Validated write |

Backend validates zod limits + NG rules; agent may retry up to 2 times on validation errors.

## Canva pipeline

1. Autofill brand template with named text fields `s1_*` … `s8_*`
2. Export PNG (all pages)
3. Store design id + per-page URLs in `post_assets`
4. Re-export on demand when preview URLs expire (design id is source of truth)

Mock mode uses placeholder URLs; dashboard may show HTML preview from `slides_json`.

## Review actions

| Action | Effect |
|---|---|
| Edit slides/caption | Persist; mark assets stale → re-render |
| Regenerate all / one slide | Agent + optional re-render |
| Approve | status=`approved`; write `topic_used` / `hook_used` |
| Reject + reason | status=`rejected`; write `idea_rejected` |
| Schedule | status=`scheduled` + `scheduled_at` (from approved only) |

## API

- `POST /ideas/:id/create` → 202, poll `GET /posts/:id` (`generationStatus`)
- `PATCH /posts/:id` (title, caption, hashtags, slides; draft only; edited slides set `generationStatus=pending` until re-rendered)
- `POST /posts/:id/regenerate` `{ feedback? }` → 202 (whole deck; per-slide regenerate not yet)
- `POST /posts/:id/render` `{ reexport? }` — `reexport: true` skips autofill and re-exports the stored design
- `POST /posts/:id/approve` (draft + ready only; writes `topic_used` / `hook_used`, idea → `used`)
- `POST /posts/:id/reject` `{ reason }` (writes `idea_rejected`, idea → `rejected`)
- `POST /posts/:id/schedule` `{ scheduledAt }` (approved only; no Instagram call)

## Canva setup (ported from marketing-automation-tools/tiktok_dashboard)

Canva rotates the refresh token on every exchange, so it is stored in the `canva_tokens` table, not env.

1. Apply the schema: `pnpm --filter @ama/db setup:turso` (adds `canva_tokens`, `canva_design_cache`)
2. Set `CANVA_CLIENT_ID` / `CANVA_CLIENT_SECRET` in the repo-root `.env`, then run `pnpm --filter @ama/db canva:bootstrap` once
3. Set the same client id/secret on the API worker. `CANVA_REFRESH_TOKEN` is an optional seed only

Export page URLs are cached for 1h in `canva_design_cache`; the design id on `post_assets` stays the source of truth.

## Acceptance criteria

- [ ] Selecting an idea yields exactly 8 slides within char limits
- [ ] Slide 7 uses job or fallback correctly
- [ ] Preview shows 8 pages (mock or Canva)
- [ ] Approve/reject update memory for next ideation
- [ ] Schedule persists without calling Instagram
