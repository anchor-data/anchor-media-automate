import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!url || !token) {
    throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before running setup");
  }

  const sqlPath = resolve(__dirname, "../sql/schema.sql");
  const sql = await readFile(sqlPath, "utf8");
  const client = createClient({ url, authToken: token });

  for (const statement of sql.split(";").map((part: string) => part.trim()).filter(Boolean)) {
    await client.execute(`${statement};`);
  }

  console.log("Schema applied to Turso");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
