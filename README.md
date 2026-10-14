# Instagram求人メディア自動化ダッシュボード (v0 scaffold)

This repository contains a greenfield scaffold for:

- Next.js dashboard facade (`apps/web`)
- Hono backend on Cloudflare Workers (`apps/api`)
- Turso/libSQL repository layer + schema (`packages/db`)
- Integration facades for OpenAI Agents / Canva / Instagram (`packages/integrations`)
- Shared API/domain types (`packages/shared`)

No auth is included in v0.

## Project structure

```txt
apps/
  api/            # Hono Worker API
  web/            # Next.js dashboard facade
packages/
  db/             # Turso schema + repository (mock fallback)
  integrations/   # Facades + mock/stub implementations
  shared/         # zod schemas and shared types
```

## Quick start (mock mode, no credentials)

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

5. Open [http://localhost:3000](http://localhost:3000)

The dashboard can:

- Show operational flow steps 1–7
- List jobs and posts from mock data
- Run agent draft generation (`POST /agent/run`)
- Approve posts (`POST /posts/:id/approve`)
- Regenerate post copy (`POST /agent/regenerate`)

## Turso setup (optional)

Set these values in `.env` and `apps/api/.dev.vars`:

- `TURSO_DATABASE_URL=libsql://...`
- `TURSO_AUTH_TOKEN=...`
- `ALLOWED_ORIGIN=http://localhost:3000` (recommended outside local testing)

Then apply schema:

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

## Integration facade status

Current mode is intentionally facade-first:

- OpenAI Agents: mock runner implemented, live runner stubbed
- Canva: mock client + live client (client-credentials auth: client id + secret only)
- Instagram Graph: mock client implemented, live client stubbed

Switch to live paths by setting keys in env (`OPENAI_API_KEY`, `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `INSTAGRAM_ACCESS_TOKEN`) and replacing stubbed methods in `packages/integrations`.
