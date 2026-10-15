import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "../../..");

/** Load KEY=VALUE pairs from repo-root .env into process.env (does not override existing). */
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
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
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
    throw new Error(
      "Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in repo-root .env (or export them) before running setup"
    );
  }

  const sqlPath = resolve(__dirname, "../sql/schema.sql");
  const sql = await readFile(sqlPath, "utf8");
  const client = createClient({ url, authToken: token });

  // Strip full-line comments first — comments may contain ";" (e.g. "versioned; one active").
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.execute(`${statement};`);
  }

  console.log(`Schema applied to Turso (${statements.length} statements)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
