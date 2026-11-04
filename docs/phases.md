# Build phases: Content Ideation & Creation

First product scope for Anchor Media Automate: **AI content ideation → carousel creation (3-10 pages, default 8) → human approve/schedule**. Instagram publish and analytics are deferred.

Aligned with [`architecture_v1.md`](./architecture_v1.md) (v1.1 AI ideation addendum) and feature specs under [`features/`](./features/).

---

## Locked product decisions

| Decision | Choice |
|---|---|
| Brand style | **Inspired-by** [わかる転職](https://www.instagram.com/wakaru_tensyoku/) — store structure as reference, do not copy IP |
| Post format | Hybrid carousel @ 4:5: **3-10 pages per account** (default 8), `knowhow` + optional `job_pick` on the pick page |
| Ideation driver | **OpenAI Agents API** always (requires `OPENAI_API_KEY`) |
| Guideline / reference | **Humans upload/edit via Dashboard** |
| 求人 | Optional later — **not required** to ideate |
| Scope end | **承認 → 予約** (no Instagram publish in this scope) |
| Images | Own renderer → PPTX → Canva import/export (no templates, no Autofill); uploaded assets + AI illustrations placed in layouts |
| Design | Derived per account from reference screenshots + written guideline; varied per post; regenerable by prompt |

---

## Phase overview

| Phase | Status | Goal |
|---|---|---|
| **0** Docs & feasibility | Done | Specs + Canva/Agents risk notes |
| **1** Data foundation | Done | Schema, zod types, seed |
| **2** Ideation | Done | Mock agent, APIs, dashboard wire |
| **3** Creation & Canva | Done | Structure-based deck + render + Canva import/export + preview |
| **3.5** Design & onboarding | Done | Renderer, account design, slide structure, onboarding wizard, cost tracking |
| **4** Review → schedule | Planned | Edit, approve/reject, memory writes, schedule |

---

## Phase 0 — Docs & feasibility

**Goal:** Write specs and document integration risks before building.

**Deliverables**

- [`features/content-ideation.md`](./features/content-ideation.md)
- [`features/content-creation.md`](./features/content-creation.md)
- [`phase-0-feasibility.md`](./phase-0-feasibility.md)
- Architecture **v1.1** addendum in [`architecture_v1.md`](./architecture_v1.md)

**Key finding (superseded):** Canva Autofill needs Enterprise + user OAuth. We avoided it entirely: Canva is only used to import a PPTX and export PNGs (user OAuth still required).

---

## Phase 1 — Data foundation

**Goal:** Persist accounts, human guideline/reference, memory, ideas, and extended posts.

**Deliverables**

- `packages/db/sql/schema.sql` — `guidelines`, `content_references`, `memory_items`, `ideas`, extended `posts` / `post_assets` / `agent_runs`
- `packages/shared` — zod schemas including `slideDeckSchema` (deck structure of 3-10 pages)
- `packages/db` — mock + Turso repository CRUD
- Seed data — wakaru-inspired slide/hook patterns + sample guideline (`acc_001`)

**Commands**

```bash
pnpm --filter @ama/db setup:turso   # apply schema (loads root .env)
pnpm --filter @ama/db seed:turso    # seed Phase-1 data if missing
```

---

## Phase 2 — Ideation (API + dashboard)

**Goal:** Humans maintain guideline/reference; agent generates idea queue from those + memory.

**Deliverables**

- `MockIdeationAgent` + **`OpenAIIdeationAgent`** (`@openai/agents`) with Backend tools
- API routes: `/ideation/run`, accounts, guideline, references, memory, ideas, `/seed`
- Web: workspace loads from API; IdeaModal → ideation; Engine settings → save guideline / manage references
**Try it**

1. Put Turso + `OPENAI_API_KEY` in `apps/api/.dev.vars` (Wrangler does not read root `.env`)
2. `pnpm dev` — `/health` should show `mode: "openai-agents"` and `integrations.openai: true`
3. Calendar → **アイデアから生成** → pick an idea  
   Draft text only — images are Phase 3

**Acceptance**

- [x] Ideation works with no jobs in DB
- [x] Ideas respect guideline / references / memory dedupe (Agents tools)
- [x] Humans can upsert guideline and add/remove references from the dashboard
- [x] Live OpenAI Agents path is always used for ideation

---

## Phase 3 — Content creation & Canva

**Goal:** Turn a selected idea into a draft (copy + images) with progress in the UI.

**Built**

1. `CreationAgent` (OpenAI Agents) → `submit_deck` validated by `slideDeckSchemaFor(structure)`
2. `@ama/renderer` builds a PPTX per post; Canva import → export of every page
3. Idea → post generation with `generation_status` polling and retry
4. Dashboard: carousel preview (HTML in mock, Canva PNGs when live), editor, "デザインを再生成"
5. Canva OAuth connect flow (rotating refresh token in `canva_tokens`)
6. Images (uploads, AI illustrations), cost tracking per post

**Acceptance**

- [x] Selecting an idea yields the account's pages within char limits
- [x] The pick page uses job pick or summary fallback
- [x] Preview shows every page (mock or Canva)
- [x] Failures set `generation_status=failed` with retry

---

## Phase 3.5 — Design, structure & onboarding

**Goal:** Every post should look different without maintaining Canva templates, and new accounts should be set up in minutes.

**Built**

- `packages/renderer` — DesignSpec, layout, HTML + PPTX output, per-post variation
- Account design from reference screenshots + guideline (`/accounts/:id/design/analyze`)
- Slide structure per account, 3-10 pages, inferred or edited (`/accounts/:id/structure/*`)
- 6-step add-account wizard; results visible in the design and agent-settings tabs
- Removed: per-post customization, design-rules panel, template variants, Canva templates/autofill

Detail: [`features/design.md`](./features/design.md), [`features/onboarding.md`](./features/onboarding.md).

---

## Phase 4 — Review → schedule

**Goal:** Human control plane through approve/reject/schedule; memory learns from outcomes.

**Planned work**

1. Edit slides/caption → mark assets stale → re-render
2. Regenerate all / one slide / caption-only
3. Approve → write `topic_used` / `hook_used` to memory
4. Reject + reason → write `idea_rejected`
5. Schedule → `status=scheduled` + `scheduled_at` (calendar)
6. Keep Instagram publish behind a flag / unused

**Acceptance**

- [ ] Approve/reject update memory for the next ideation run
- [ ] Schedule persists without calling Instagram
- [ ] Full Flow A works end-to-end with OpenAI Agents + Turso

---

## Out of scope (later)

- Instagram Graph publish & insights
- Analytics dashboard (live data)
- Cron auto-fill of idea queue / auto-create drafts
- Job CSV ingestion as primary ideation input

---

## Suggested order of work from here

1. **Phase 4** — approve / reject / schedule + memory writes

---

## Related docs

| Doc | Purpose |
|---|---|
| [`architecture_v1.md`](./architecture_v1.md) | System architecture + v1.1 ideation |
| [`features/content-ideation.md`](./features/content-ideation.md) | Ideation product spec |
| [`features/content-creation.md`](./features/content-creation.md) | Creation / review product spec |
| [`features/design.md`](./features/design.md) | Design, renderer, structure, cost |
| [`features/onboarding.md`](./features/onboarding.md) | Add-account wizard |
| [`phase-0-feasibility.md`](./phase-0-feasibility.md) | Canva & Agents risks |


## Instagram connect + scheduled publish

- Per-account OAuth via *Instagram API with Instagram Login* (`/api/accounts/:id/instagram/connect` → `/api/instagram/callback`). Long-lived token stored in `instagram_connections`, refreshed by the cron within 14 days of expiry.
- `POST /posts/:id/schedule` stores the time; the `*/10 * * * *` cron publishes due posts as a carousel (2-10 images) and records `instagram_media_id` / `instagram_permalink`, or `publish_error` with status `failed` (reschedule to retry).
- Setup: create a Meta app, add the Instagram product, register redirect URI `https://<host>/api/instagram/callback`, set `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`, run `pnpm --filter @ama/db setup:turso` to add the new table/columns. `instagram_business_content_publish` needs App Review before non-tester accounts can connect.
