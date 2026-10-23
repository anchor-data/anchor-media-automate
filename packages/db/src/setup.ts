import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { loadRootEnv } from "./load-env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ACCOUNT_COLUMN_MIGRATIONS = [
  "auto_run_enabled INTEGER NOT NULL DEFAULT 0",
  "auto_run_schedule TEXT NOT NULL DEFAULT '毎日 18:00'",
  "last_auto_run_at TEXT"
] as const;

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

  // CREATE TABLE IF NOT EXISTS never alters an existing table, so add newer columns by hand.
  for (const column of ACCOUNT_COLUMN_MIGRATIONS) {
    try {
      await client.execute(`ALTER TABLE accounts ADD COLUMN ${column}`);
    } catch (error) {
      if (!(error instanceof Error) || !/duplicate column/i.test(error.message)) throw error;
    }
  }

  console.log(`Schema applied to Turso (${statements.length} statements)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
