import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./index.js";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rowCount } = await client.query(
        "select 1 from schema_migrations where name = $1",
        [file],
      );
      if (rowCount) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`applying ${file}...`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [
          file,
        ]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
    console.log("migrations up to date");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
