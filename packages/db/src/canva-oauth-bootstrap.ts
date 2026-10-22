/**
 * One-time helper to obtain a Canva Connect refresh token (authorization code + PKCE).
 * Ported from marketing-automation-tools/tiktok_dashboard/canva_oauth_bootstrap.py.
 *
 * Prereqs, in the Canva developer portal (https://www.canva.com/developers/):
 *   1. Create an Integration (Connect app) in a Canva Enterprise org.
 *   2. Set the authentication redirect URL to exactly http://127.0.0.1:8765/callback
 *   3. Enable scopes: design:meta:read design:content:read design:content:write
 *      brandtemplate:meta:read brandtemplate:content:read
 *   4. Put CANVA_CLIENT_ID and CANVA_CLIENT_SECRET in the repo-root .env
 *
 * Run: pnpm --filter @ama/db canva:bootstrap
 *
 * Canva rotates the refresh token on every use, so it is stored in the canva_tokens table
 * (not in env). Requires TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { createRepository } from "./index";
import { loadRootEnv } from "./load-env";

const REDIRECT_URI = "http://127.0.0.1:8765/callback";
const AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const SCOPE = [
  "design:meta:read",
  "design:content:read",
  "design:content:write",
  "brandtemplate:meta:read",
  "brandtemplate:content:read"
].join(" ");
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

const base64url = (buffer: Buffer) => buffer.toString("base64url");

function waitForCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for the Canva callback"));
    }, CALLBACK_TIMEOUT_MS);

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      const state = url.searchParams.get("state");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      // Ignore stale tabs from a previous attempt; keep listening for the expected state.
      if (state !== expectedState) {
        res.end("<h2>Stale callback ignored.</h2><p>Waiting for fresh auth...</p>");
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.end(
        code
          ? "<h2>Canva auth complete.</h2><p>You can close this tab.</p>"
          : `<h2>Auth error</h2><pre>${error ?? "no code"}</pre>`
      );
      clearTimeout(timer);
      server.close();
      if (code) resolve(code);
      else reject(new Error(`Canva returned error: ${error ?? "no code"}`));
    });
    server.listen(8765, "127.0.0.1");
  });
}

async function main() {
  await loadRootEnv();
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Set CANVA_CLIENT_ID and CANVA_CLIENT_SECRET first");
  const repo = createRepository({
    tursoUrl: process.env.TURSO_DATABASE_URL,
    tursoAuthToken: process.env.TURSO_AUTH_TOKEN
  });
  if (repo.mode !== "turso") {
    throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN: the rotating refresh token must be stored in the DB");
  }

  const state = base64url(randomBytes(16));
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const authUrl = `${AUTH_URL}?${new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  })}`;

  const codePromise = waitForCallback(state);
  console.log(`Opening browser for Canva consent. If it does not open, visit:\n  ${authUrl}\n`);
  exec(`open "${authUrl}"`, (error) => {
    if (error) console.error(`Could not open the browser (${error.message}). Open the URL above manually.`);
  });
  const code = await codePromise;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    })
  });
  if (!response.ok) throw new Error(`Token exchange failed (${response.status}): ${await response.text()}`);
  const token = (await response.json()) as { refresh_token?: string; expires_in?: number };
  if (!token.refresh_token) throw new Error("Canva returned no refresh_token");

  await repo.saveCanvaRefreshToken(token.refresh_token);
  console.log("Success: refresh token stored in the canva_tokens table.");
  console.log("Set CANVA_CLIENT_ID and CANVA_CLIENT_SECRET on the API (wrangler secret put ...).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
