import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL አልተቀመጠም / DATABASE_URL is not set"); process.exit(1); }

const dir = path.resolve(process.cwd(), "migrations");
const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  await client.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let count = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    console.log(`→ applying ${f}`);
    await client.query("begin");
    try {
      await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [f]);
      await client.query("commit");
      count++;
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  console.log(count ? `✓ ${count} migration(s) applied` : "✓ database is up to date");
}
main().catch((e) => { console.error("✗ migration failed:", e.message); process.exitCode = 1; }).finally(() => client.end());
