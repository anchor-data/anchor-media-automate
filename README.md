# Instagram 求人メディア自動化ダッシュボード

AI がアイデア出しからカルーセル投稿(コピー・画像・デザイン)まで作り、人が確認・承認・予約するためのダッシュボードです。

- Next.js dashboard (`apps/web`)
- Hono backend on Cloudflare Workers (`apps/api`)
- Turso/libSQL repository layer + schema (`packages/db`)
- OpenAI Agents / Canva / Instagram integrations (`packages/integrations`)
- Own slide renderer: DesignSpec → HTML preview + PPTX (`packages/renderer`)
- Shared API/domain types (`packages/shared`)

No auth is included yet.
Design: https://app.paper.design/file/01M5YW2D2RJBNJBQWEV0H6JCBJ/p-1-0

## How a post is made

1. **Ideation** — the OpenAI agent proposes ideas from the account's guideline, references and memory.
2. **Creation** — the agent writes the copy for the account's slide structure (3-10 pages, default 8) and may add images (uploaded assets or AI illustrations).
3. **Design** — each account has a design derived from reference screenshots + a written guideline; every post varies it a little; a post can be redesigned with a prompt.
4. **Render** — `@ama/renderer` builds a PPTX, Canva imports it (editable there) and exports a PNG per page for the preview.
5. **Review** — edit, approve (→ memory), schedule. Approved posts publish to Instagram as carousels (see `docs/phases.md`).

Details: [`docs/features/`](docs/features) (`content-ideation`, `content-creation`, `design`, `onboarding`), [`docs/architecture_v1.md`](docs/architecture_v1.md), [`docs/phases.md`](docs/phases.md).

## Project structure

```txt
apps/
  api/            # Hono Worker API
  web/            # Next.js dashboard
packages/
  db/             # Turso schema + repository (mock fallback)
  integrations/   # OpenAI agents, Canva (import/export), Instagram, image generation, cost rates
  renderer/       # DesignSpec, layout, HTML + PPTX output, design/structure inference
  shared/         # zod schemas, deck structure model
```

## Quick start

Ideation uses the **OpenAI Agents API** and requires `OPENAI_API_KEY` in `apps/api/.dev.vars`.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set environment files:

   ```bash
   cp .env.example .env
   cp apps/api/.dev.vars.example apps/api/.dev.vars
   ```

3. Start API:

   ```bash
   pnpm --filter @ama/api dev
   ```

4. Start dashboard:

   ```bash
   pnpm --filter @ama/web dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) (use another port with `next dev -p 3001` if 3000 is taken)

The dashboard can:

- Add an account with a step-by-step wizard (account, target/concept, design, slide structure, schedule)
- Generate ideas and drafts, edit slides, regenerate copy or the design (with a prompt), approve and schedule
- Show the account design and slide structure (デザイン) and edit them
- Show what each post cost to generate

## Turso setup (optional)

Set these values in `.env` and `apps/api/.dev.vars`:

- `TURSO_DATABASE_URL=libsql://...`
- `TURSO_AUTH_TOKEN=...`
- `ALLOWED_ORIGIN=http://localhost:3000` (recommended outside local testing)

Then apply schema (also adds `accounts.design_json` to an existing database):

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... pnpm --filter @ama/db setup:turso
```

When both variables are set, API routes use Turso. Otherwise, they use the mock store.

## Commands

- `pnpm dev` - run api + web in parallel
- `pnpm dev:api` - run API only
- `pnpm dev:web` - run web only
- `pnpm typecheck` - type check all workspaces
- `pnpm --filter @ama/web build` - build dashboard
- `pnpm --filter @ama/api build` - worker dry-run deploy build
- `pnpm --filter @ama/renderer test` - renderer tests
- `pnpm --filter @ama/renderer poc` - render sample slides locally for a visual check

## Integrations

- **OpenAI**: `OPENAI_API_KEY`. Ideation and creation use `@openai/agents` (`gpt-4.1-mini`); design/structure inference use `gpt-4.1` chat completions with images; illustrations use `gpt-image-1-mini` by default. Token usage is converted to USD (`packages/integrations/src/openai-cost.ts`).
- **Canva Connect**: `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REFRESH_TOKEN` (user OAuth; the refresh token rotates and is kept in `canva_tokens`). Scopes: `design:meta:read`, `design:content:read`, `design:content:write`. Canva is used only to import the PPTX and export PNGs; no brand templates or Autofill (so no Enterprise plan is needed). Without credentials a mock client returns placeholder previews.
- **R2**: `IMAGE_ASSETS` (uploaded assets, AI illustrations), `REFERENCE_FILES`.
- **Instagram Graph**: connect with a pasted access token (Unified login `EAA…` via graph.facebook.com, or Instagram Login `IGAA…` via graph.instagram.com); carousels are published by the cron.

## Cost (measured)

Copy for one post about $0.03, one AI illustration about $0.03, deriving a design about $0.01. Rendering and Canva are free.

## Known limitations

- Canva keeps only normal/bold weights from a PPTX.
- Editing slide text in the app creates a new Canva import, so manual Canva edits are lost; use "プレビューを更新" to re-export after editing in Canva.
- Page types are fixed (cover / empathy / point / pick / CTA); the design chooses among a few arrangements.
