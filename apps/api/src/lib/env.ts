import { createRepository, type Repository } from "@ama/db";
import { createCanvaClient, type CanvaClient } from "@ama/integrations";

export type Bindings = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  OPENAI_API_KEY?: string;
  CANVA_CLIENT_ID?: string;
  CANVA_CLIENT_SECRET?: string;
  /** Seed only. Once canva_tokens is populated the DB row wins (Canva rotates the token). */
  CANVA_REFRESH_TOKEN?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  ALLOWED_ORIGIN?: string;
};

export function createRepo(env: Bindings): Repository {
  return createRepository({
    tursoUrl: env.TURSO_DATABASE_URL,
    tursoAuthToken: env.TURSO_AUTH_TOKEN
  });
}

/** Live Canva only when credentials are set AND the DB can hold the rotating refresh token. */
export function createCanva(env: Bindings, repo: Repository): CanvaClient {
  return createCanvaClient({
    canvaClientId: env.CANVA_CLIENT_ID,
    canvaClientSecret: env.CANVA_CLIENT_SECRET,
    canvaRefreshToken: env.CANVA_REFRESH_TOKEN,
    canvaTokenStore:
      repo.mode === "turso"
        ? { load: () => repo.getCanvaRefreshToken(), save: (token) => repo.saveCanvaRefreshToken(token) }
        : undefined,
    canvaDesignCache:
      repo.mode === "turso"
        ? {
            get: (designId, maxAgeMs) => repo.getCachedDesignPages(designId, maxAgeMs),
            set: (designId, urls) => repo.saveCachedDesignPages(designId, urls)
          }
        : undefined
  });
}
