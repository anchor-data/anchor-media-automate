# Feature: Content Ideation

## Purpose

Generate Instagram carousel **ideas** with the OpenAI Agents API, using human-uploaded **guideline** and **reference** material plus system **memory**. Operators pick an idea; content creation turns it into an 8-slide draft.

求人 (jobs) are optional and not required for ideation.

## Scope

**In**

- Manual “AIで企画案を生成” from the dashboard (optional seed text / URL)
- Agent reads guideline + references + memory
- Persist ideas in an idea queue
- Deduplicate via memory / previous posts
- Humans create and edit guidelines and references in the dashboard

**Out (this phase of product)**

- Instagram publish
- Job-driven selection as the primary path
- Auto-create full drafts from cron (later)

## Human inputs (Dashboard)

### Guideline (per account, versioned)

Uploaded / edited by humans. One active guideline per account.

| Field | Description |
|---|---|
| target | Audience (e.g. 20代の初めての転職) |
| concept | Account positioning |
| tone | Voice |
| content_pillars | Topics allowed (面接, 職務経歴書, …) |
| ng_rules | Forbidden claims (内定保証禁止, 前職悪口禁止, …) |
| cta_policy | CTA wording rules |
| hashtag_policy | Hashtag count / required tags |
| job_pick_enabled | Whether slide 7 may use a job |
| system_prompt | Extra instructions for the agent |

### Reference (library, per account)

Uploaded / managed by humans. Structure and examples only — **inspired-by**, never copy third-party brand assets.

| kind | Purpose |
|---|---|
| `slide_pattern` | Roles of the 8 slides |
| `hook_pattern` | Hook formulas |
| `voice_sample` | Tone examples (paraphrased / original) |
| `doc` | Uploaded company / know-how text |
| `url_note` | Summary of a reference URL |

Starter seed may include a wakaru-inspired `slide_pattern` + hook patterns; operators can edit or delete them.

### Memory (system-written; human can view / remove)

| kind | When written |
|---|---|
| `topic_used` | On approve |
| `hook_used` | On approve |
| `idea_rejected` | On reject (with reason) |
| `editor_feedback` | Summarized human edits (later) |
| `preference` | Explicit user notes |

## Agent tools (Backend-owned)

| Tool | Role |
|---|---|
| `get_guideline(accountId)` | Active guideline |
| `list_references(accountId, kind?)` | Human reference library |
| `get_memory(accountId, …)` | Past topics / rejections |
| `get_previous_posts(accountId, limit)` | Recent posts |
| `check_duplicate(accountId, topicKey, title)` | Backend dedupe |
| `get_candidate_jobs(accountId, limit)` | Optional; may return `[]` |
| `submit_ideas(ideas[])` | Validated write → `queued` ideas |

## Idea lifecycle

`queued` → `selected` → `used` (after draft created)  
or `rejected` (feeds memory)

Each idea includes: title, summary, pillar, topic_key, hook, angle, reference_ids, optional job_id, rationale.

## API (planned)

- `POST /accounts/:id/guideline` / `GET` / `PATCH` — human CRUD
- `GET|POST /accounts/:id/references`, `PATCH|DELETE /references/:id`
- `GET|DELETE /accounts/:id/memory[/:memId]`
- `POST /ideation/run` `{ accountId, count?, seedText?, seedUrl? }` → ideas
- `GET /accounts/:id/ideas`, `PATCH /ideas/:id`

## Dashboard touchpoints

- Engine settings → guideline editor + memory tags + idea queue
- Reference library UI (upload / edit / deactivate)
- Idea modal → seed text → 3 options → “この企画で投稿を生成”

## Acceptance criteria

- [ ] With no jobs in DB, ideation still returns ≥3 ideas
- [ ] Ideas respect guideline pillars and NG rules
- [ ] Ideas avoid topics in memory (topic_key window, default 90 days)
- [ ] Humans can create/update guideline and references from the dashboard
- [ ] Rejected ideas influence the next run via memory

## IP policy

References store **structure and paraphrased examples** only. Prompts must treat third-party accounts as inspiration, not sources to copy.
