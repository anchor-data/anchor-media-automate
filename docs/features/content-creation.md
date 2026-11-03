# Feature: Content Creation

## Purpose

Turn a selected **idea** into an Instagram carousel draft: the account's pages of copy (3-10, default 8) + caption/hashtags, rendered from the account's design and imported into Canva, then reviewed in the dashboard through **承認 → 予約**.

## Scope

**In**

- Creation agent builds the deck for the account's **slide structure** (3-10 pages, default 8) @ 4:5
- AI illustrations / uploaded assets placed on pages (see `design.md`)
- Measured generation cost per post
- PPTX render (`@ama/renderer`) imported into Canva + multi-page PNG export (or mock placeholders)
- Preview, edit, regenerate
- Approve / reject / schedule
- Memory writes on approve / reject

**Out**

- Instagram Graph publish (later)
- Metrics / analytics UI

## Post anatomy

- `idea_id` — provenance
- `post_type` — `knowhow` | `job_pick` (hybrid layout; the `pick` page switches)
- `slides_json` — the validated text fields (`s{page}_{name}`) plus `structure`, `images`, `design`, `designPrompt`, `costUsd`
- `caption`, `hashtags`
- `status` + `generation_status`
- `post_assets` — one row per page (Canva design id + export URL)

## Slide structure

A deck is an ordered list of page **roles**, taken from the account (`accounts.design_json.structure`, see `design.md`). A post stores the structure it was created with (`slides_json.structure`; posts without one are the default 8 pages).

| Role | Fields (max chars) | Notes |
|---|---|---|
| `cover` | title (20), sub (11) | first page, hook |
| `empathy` | head (6), body (33) | names the reader's worry |
| `point` | num (1), head (6), body (42) | know-how point, repeated once per tip |
| `pick` | label (4), head (5), body (36) | job pick **or** summary fallback |
| `cta` | head (8), cta (7) | last page |

Rules: 3-10 pages, cover first, CTA last, at least one `point`. The default structure is `cover, empathy, point ×4, pick, cta` (the 8 pages every post used to have); its keys are unchanged (`s1_title` ... `s8_cta`).

Limits live in `ROLE_FIELDS` (`@ama/shared`) and are enforced by `slideDeckSchemaFor(structure)`; the renderer lays each field out in its own text box and shrinks a heading (down to 70%) before it would wrap.

**Pick page rule (default):** if the idea has `job_id` and guideline `job_pick_enabled`, fill job fields; otherwise summary/checklist fallback.

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
| `list_image_assets` | Uploaded images that may be placed on pages |
| `submit_deck(slides, caption, hashtags, images, imagePrompts)` | Validated write; fields are exactly the structure's |

Backend validates the structure's limits, NG rules and image slots; the agent may retry on validation errors (up to 3 rejected submissions). The user message lists the pages (`describeStructure`), so a 5-page deck is a 5-page prompt.

## Design and rendering

Each account has a design (see `design.md`): derived from reference screenshots plus a written guideline, with a small per-post variation. Rendering a post:

1. The post's design (account design varied by the post id, stored in `slides_json.design`) and the copy of every page become a PPTX (`@ama/renderer`). Japanese line breaks are chosen on our side.
2. Canva imports the PPTX (`POST /v1/imports`) as an editable design: every text box and shape stays a separate element.
3. Canva exports PNGs; one URL per page is stored in `post_assets` with the design id. The app shows these previews and links to the design in Canva for manual edits.
4. `POST /posts/:id/render { reexport: true }` only re-exports the stored design, so edits made in Canva show up in the app. Editing slide text in the app imports a new design (manual Canva edits to the old one are not carried over).

Images: assets and AI illustrations are read from R2 and embedded in the PPTX; a page with an image gets an image layout and the whole image is shown (never cropped). A missing file just renders the page without it.

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
- `PATCH /posts/:id` (title, caption, hashtags, slides — validated against the post's structure; draft only; edited slides set `generationStatus=pending` until re-rendered)
- `POST /posts/:id/regenerate` `{ feedback? }` → 202 (whole deck; per-slide regenerate not yet)
- `POST /posts/:id/design/regenerate` `{ prompt? }` → 202, re-renders in Canva with a new design
- `POST /posts/:id/render` `{ reexport? }` — `reexport: true` skips the import and re-exports the stored design
- `POST /posts/:id/approve` (draft + ready only; writes `topic_used` / `hook_used`, idea → `used`)
- `POST /posts/:id/reject` `{ reason }` (writes `idea_rejected`, idea → `rejected`)
- `POST /posts/:id/schedule` `{ scheduledAt }` (approved only; no Instagram call)

## Canva setup (ported from marketing-automation-tools/tiktok_dashboard)

Canva is used to **import** the PPTX and **export** PNGs (no autofill, no brand templates, so no Canva Enterprise autofill access is needed).

Canva rotates the refresh token on every exchange, so it is stored in the `canva_tokens` table, not env.

1. Apply the schema: `pnpm --filter @ama/db setup:turso` (adds `canva_tokens`, `canva_design_cache`)
2. Set `CANVA_CLIENT_ID` / `CANVA_CLIENT_SECRET` in the repo-root `.env`, then run `pnpm --filter @ama/db canva:bootstrap` once
3. The Canva integration needs the scopes `design:meta:read`, `design:content:read` and `design:content:write` (import + export). Set the same client id/secret on the API worker. `CANVA_REFRESH_TOKEN` is an optional seed only

Canva's status endpoint sometimes answers 5xx while a job is running; polling tolerates up to 4 consecutive such answers. Design titles are cut to Canva's 50-character limit. Export page URLs are cached for 1h in `canva_design_cache`; the design id on `post_assets` stays the source of truth.

## Cost

Each step records what it cost, measured from the model's token usage: `slides_json.costUsd { copy, images, design }` (regenerations add up) and, for deriving an account design, `design_json.analysisCostUsd`. The editor shows the post total. Rates live in `packages/integrations/src/openai-cost.ts` (`gpt-4.1`, `gpt-4.1-mini`, `gpt-image-1`, `gpt-image-1-mini`, `gpt-image-1.5`; a snapshot name such as `gpt-4.1-mini-2025-04-14` takes the longest matching id's rate).

Measured (local stack): copy for one post $0.024-0.032, one AI illustration about $0.034 (generated from reference images), deriving a design from 3 screenshots about $0.008, inferring a structure about $0.014. Rendering and Canva are free.

## Acceptance criteria

- [ ] Selecting an idea yields a deck with exactly the account's pages, within char limits
- [ ] The pick page uses job or fallback correctly
- [ ] Preview shows every page (mock or Canva) and the pager matches the page count
- [ ] Approve/reject update memory for next ideation
- [ ] Schedule persists without calling Instagram
