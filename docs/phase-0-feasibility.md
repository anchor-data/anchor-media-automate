# Phase 0 feasibility notes

Date: 2026-10-15  
Scope: Canva Autofill auth + OpenAI Agents on Cloudflare Workers

## Canva Autofill

### What we have

- Env placeholders: `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET` (`.env` / `.dev.vars`)
- Live client: `CanvaApiClient` uses **client_credentials** grant, then `POST /autofills` with `title` / `subtitle` only
- `getExportUrl` returns **only `urls[0]`** (needs all 8 pages for carousels)
- `wrangler.jsonc` still lists unused `CANVA_API_KEY` — clean up in a later phase

### What Canva requires for Autofill

Per [Canva Autofill guide](https://www.canva.dev/docs/connect/autofill-guide/) and [Create autofill job](https://www.canva.dev/docs/connect/api-reference/autofills/create-design-autofill-job/):

1. Integration and calling user must be on **Canva Enterprise**
2. Token must act **on behalf of a user** (Authorization Code + PKCE)
3. Scopes for brand template / autofill must be approved

**Verdict:** Client ID/secret alone are necessary but **not sufficient**. Current `client_credentials` path will not satisfy Autofill. Phase 3+ needs:

- OAuth connect flow in dashboard (“Connect Canva”)
- Stored refresh token (`integration_tokens` or similar)
- Multi-field autofill + multi-URL export

**Mitigation for Phases 1–4:** keep `MockCanvaClient` + HTML/`slides_json` preview so ideation/creation UX can ship without live Autofill.

### Live probe (not run in Phase 0)

Do **not** call Autofill until user OAuth exists. Optional later check: exchange authorization code, then one autofill against a staging brand template.

## OpenAI Agents on Workers

### What we have

- `OpenAIAgentsRunner` stub (`not implemented in v0`)
- Ideation uses live `@openai/agents` (no `AGENT_MODE` switch)
- Creation Agents path lands in Phase 3

### Risks on Cloudflare Workers

- SDK may assume Node APIs → `nodejs_compat` enabled
- Agent + tool loops can exceed Worker CPU/time → run ideation and creation as **separate requests**; use Queues/Workflows if needed

**Verdict:** Live Agents for ideation is wired. Creation should follow the same tool-bound Agents pattern.

## Phase 0 exit criteria

- [x] Feature docs written (`content-ideation`, `content-creation`, `canva-template-spec`)
- [x] Architecture v1.1 addendum noted
- [x] Canva auth gap documented
- [x] Agents/Workers risk documented
- [x] Phase 1 data contracts implementable without live Canva/OpenAI
