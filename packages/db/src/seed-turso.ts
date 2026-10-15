import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRepository } from "./index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

async function loadRootEnv() {
  try {
    const raw = await readFile(resolve(repoRoot, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function main() {
  await loadRootEnv();
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env");
  }
  const repo = createRepository({ tursoUrl: url, tursoAuthToken: token });
  const result = await repo.ensurePhase1Seed();
  console.log(
    result.seeded
      ? `Seeded Phase-1 data for ${result.accountId}`
      : `Seed already present for ${result.accountId} (skipped)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
