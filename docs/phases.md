# Build phases: Content Ideation & Creation

First product scope for Anchor Media Automate: **AI content ideation → 8-slide carousel creation → human approve/schedule**. Instagram publish and analytics are deferred.

Aligned with [`architecture_v1.md`](./architecture_v1.md) (v1.1 AI ideation addendum) and feature specs under [`features/`](./features/).

---

## Locked product decisions

| Decision | Choice |
|---|---|
| Brand style | **Inspired-by** [わかる転職](https://www.instagram.com/wakaru_tensyoku/) — store structure as reference, do not copy IP |
| Post format | Hybrid **8 slides @ 4:5** (`knowhow` + optional `job_pick` on slide 7) |
| Ideation driver | **OpenAI Agents API** (`AGENT_MODE=auto` → Agents when `OPENAI_API_KEY` set; else mock) |
| Guideline / reference | **Humans upload/edit via Dashboard** |
| 求人 | Optional later — **not required** to ideate |
| Scope end | **承認 → 予約** (no Instagram publish in this scope) |
| Images | Canva Autofill in production; mock/HTML preview until OAuth works |

---

## Phase overview

| Phase | Status | Goal |
|---|---|---|
| **0** Docs & feasibility | Done | Specs + Canva/Agents risk notes |
| **1** Data foundation | Done | Schema, zod types, seed |
| **2** Ideation | Done | Mock agent, APIs, dashboard wire |
| **3** Creation & Canva | Next | 8-slide deck + render + preview |
| **4** Review → schedule | Planned | Edit, approve/reject, memory writes, schedule |

---

## Phase 0 — Docs & feasibility

**Goal:** Write specs and document integration risks before building.

**Deliverables**

- [`features/content-ideation.md`](./features/content-ideation.md)
- [`features/content-creation.md`](./features/content-creation.md)
- [`features/canva-template-spec.md`](./features/canva-template-spec.md)
- [`phase-0-feasibility.md`](./phase-0-feasibility.md)
- Architecture **v1.1** addendum in [`architecture_v1.md`](./architecture_v1.md)

**Key finding:** Canva Autofill needs Enterprise + **user OAuth** (not client-credentials alone). Mock Canva covers Phases 1–4 until Connect is wired.

---

## Phase 1 — Data foundation

**Goal:** Persist accounts, human guideline/reference, memory, ideas, and extended posts.

**Deliverables**

- `packages/db/sql/schema.sql` — `guidelines`, `content_references`, `memory_items`, `ideas`, extended `posts` / `post_assets` / `agent_runs`
- `packages/shared` — zod schemas including `slideDeckSchema` (8-slide hybrid)
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
- Default `AGENT_MODE=auto`: uses Agents API when `OPENAI_API_KEY` is set

**Try it**

1. Put Turso + `OPENAI_API_KEY` in `apps/api/.dev.vars` (Wrangler does not read root `.env`)
2. `pnpm dev` — `/health` should show `integrations.openai: true`
3. Calendar → **アイデアから生成** → pick an idea  
   Draft text only — images are Phase 3

**Acceptance**

- [x] Ideation works with no jobs in DB
- [x] Ideas respect guideline / references / memory dedupe (mock + Agents tools)
- [x] Humans can upsert guideline and add/remove references from the dashboard
- [x] OpenAI Agents path implemented for ideation (set key to use live)

---

## Phase 3 — Content creation & Canva

**Goal:** Turn a selected idea into an 8-slide draft (copy + images) with progress in the UI.

**Planned work**

1. `CreationAgent` (mock + later OpenAI) → `submit_deck` validated by `slideDeckSchema`
2. Extend Canva client: multi-field autofill (`s1_*`…`s8_*`), export **all 8** page URLs
3. `POST /ideas/:id/create` → 202 + poll `generation_status`
4. Dashboard: carousel preview (HTML from `slides_json` in mock; Canva PNGs when live)
5. Canva OAuth connect flow if Autofill requires user token (see feasibility doc)

**Acceptance**

- [ ] Selecting an idea yields exactly 8 slides within char limits
- [ ] Slide 7 uses job pick or summary fallback
- [ ] Preview shows 8 pages (mock or Canva)
- [ ] Failures set `generation_status=failed` with retry

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
- [ ] Full Flow A works in mock mode without credentials

---

## Out of scope (later)

- Instagram Graph publish & insights
- Analytics dashboard (live data)
- Cron auto-fill of idea queue / auto-create drafts
- Live OpenAI Agents on Workers (switch `AGENT_MODE=openai` after smoke test)
- Job CSV ingestion as primary ideation input

---

## Suggested order of work from here

1. **Phase 3** — creation agent + mock 8-slide render + preview  
2. Canva OAuth + real brand template (parallel if Enterprise ready)  
3. **Phase 4** — approve / reject / schedule + memory writes  
4. OpenAI ideation/creation behind `AGENT_MODE=openai`

---

## Related docs

| Doc | Purpose |
|---|---|
| [`architecture_v1.md`](./architecture_v1.md) | System architecture + v1.1 ideation |
| [`features/content-ideation.md`](./features/content-ideation.md) | Ideation product spec |
| [`features/content-creation.md`](./features/content-creation.md) | Creation / review product spec |
| [`features/canva-template-spec.md`](./features/canva-template-spec.md) | 8-page field contract |
| [`phase-0-feasibility.md`](./phase-0-feasibility.md) | Canva & Agents risks |
