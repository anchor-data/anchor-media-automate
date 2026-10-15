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

## API (planned)

- `POST /ideas/:id/create` → 202, poll `GET /posts/:id`
- `PATCH /posts/:id` (slides, caption, scheduledAt)
- `POST /posts/:id/regenerate`
- `POST /posts/:id/render`
- `POST /posts/:id/approve`
- `POST /posts/:id/reject`
- `POST /posts/:id/schedule`

## Acceptance criteria

- [ ] Selecting an idea yields exactly 8 slides within char limits
- [ ] Slide 7 uses job or fallback correctly
- [ ] Preview shows 8 pages (mock or Canva)
- [ ] Approve/reject update memory for next ideation
- [ ] Schedule persists without calling Instagram
