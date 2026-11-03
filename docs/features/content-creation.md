# Feature: Content Creation

## Purpose

Turn a selected **idea** into an Instagram carousel draft: 8 slides of copy + caption/hashtags, rendered from the account's design and imported into Canva, then reviewed in the dashboard through **承認 → 予約**.

## Scope

**In**

- Creation agent builds a hybrid 8-slide deck @ 4:5
- PPTX render (`@ama/renderer`) imported into Canva + multi-page PNG export (or mock placeholders)
- Preview, edit, regenerate
- Approve / reject / schedule
- Memory writes on approve / reject

**Out**

- Instagram Graph publish (later)
- Metrics / analytics UI

## Post anatomy

- `idea_id` — provenance
- `post_type` — `knowhow` | `job_pick` (hybrid layout; slide 7 switches)
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

Character limits are enforced in `@ama/shared` (`slideDeckSchema`). The renderer lays each field out in its own text box.

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

## Design and rendering

Each account has a design (see `design.md`): derived from reference screenshots plus a written guideline, with a small per-post variation. Rendering a post:

1. The post's design (account design varied by the post id, stored in `slides_json.design`) and the 8 slides of copy become a PPTX (`@ama/renderer`). Japanese line breaks are chosen on our side.
2. Canva imports the PPTX (`POST /v1/imports`) as an editable design: every text box and shape stays a separate element.
3. Canva exports PNGs; the 8 URLs are stored in `post_assets` with the design id. The app shows these previews and links to the design in Canva for manual edits.
4. `POST /posts/:id/render { reexport: true }` only re-exports the stored design, so edits made in Canva show up in the app. Editing slide text in the app imports a new design (manual Canva edits to the old one are not carried over).

Mock mode returns placeholder URLs.

## Review actions

| Action | Effect |
|---|---|
| Edit slides/caption | Persist; mark assets stale → re-render |
| Regenerate all / one slide | Agent + optional re-render |
| Regenerate design | `POST /posts/:id/design/regenerate { prompt? }`: free text changes the design, no prompt varies it again; text is kept |
| Approve | status=`approved`; write `topic_used` / `hook_used` |
| Reject + reason | status=`rejected`; write `idea_rejected` |
| Schedule | status=`scheduled` + `scheduled_at` (from approved only) |

## API

- `POST /ideas/:id/create` → 202, poll `GET /posts/:id` (`generationStatus`)
- `PATCH /posts/:id` (title, caption, hashtags, slides; draft only; edited slides set `generationStatus=pending` until re-rendered)
- `POST /posts/:id/regenerate` `{ feedback? }` → 202 (whole deck; per-slide regenerate not yet)
- `POST /posts/:id/design/regenerate` `{ prompt? }` → 202, re-renders in Canva with a new design
- `POST /posts/:id/render` `{ reexport? }` — `reexport: true` skips the import and re-exports the stored design
- `POST /posts/:id/approve` (draft + ready only; writes `topic_used` / `hook_used`, idea → `used`)
- `POST /posts/:id/reject` `{ reason }` (writes `idea_rejected`, idea → `rejected`)
- `POST /posts/:id/schedule` `{ scheduledAt }` (approved only; no Instagram call)

## Canva setup (ported from marketing-automation-tools/tiktok_dashboard)

Canva rotates the refresh token on every exchange, so it is stored in the `canva_tokens` table, not env.

1. Apply the schema: `pnpm --filter @ama/db setup:turso` (adds `canva_tokens`, `canva_design_cache`)
2. Set `CANVA_CLIENT_ID` / `CANVA_CLIENT_SECRET` in the repo-root `.env`, then run `pnpm --filter @ama/db canva:bootstrap` once
3. The Canva integration needs the scopes `design:meta:read`, `design:content:read` and `design:content:write` (import + export). Set the same client id/secret on the API worker. `CANVA_REFRESH_TOKEN` is an optional seed only

Export page URLs are cached for 1h in `canva_design_cache`; the design id on `post_assets` stays the source of truth.

## Acceptance criteria

- [ ] Selecting an idea yields exactly 8 slides within char limits
- [ ] Slide 7 uses job or fallback correctly
- [ ] Preview shows 8 pages (mock or Canva)
- [ ] Approve/reject update memory for next ideation
- [ ] Schedule persists without calling Instagram
