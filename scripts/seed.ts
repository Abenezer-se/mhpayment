/** Production-safe seed: ONLY official initial configuration (no fake members, no fake payments). Idempotent. */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { currentPeriod } from "../shared/calendar/payment-period";
import { ensurePeriods } from "../server/services/periods";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL አልተቀመጠም"); process.exit(1); }
const data = JSON.parse(fs.readFileSync(path.resolve("seed/initial-data.json"), "utf8"));
const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  await client.query("begin");
  try {
    const set = (k: string, v: unknown) => client.query(
      "insert into organization_settings (key, value) values ($1, $2::jsonb) on conflict (key) do nothing", [k, JSON.stringify(v)]);
    await set("org_name", data.organization.name); await set("org_phone", data.organization.phone);
    await set("org_email", data.organization.email); await set("org_address", data.organization.address);
    await set("system_start_year", data.systemStartYear); await set("bill_pagumen", !!data.billPagumen);

    for (const [table, list] of [["service_departments", data.departments], ["member_types", data.memberTypes]] as const) {
      let order = 1;
      for (const name of list as string[])
        await client.query(`insert into ${table} (name, sort_order) select $1, $2 where not exists (select 1 from ${table} where lower(name)=lower($1))`, [name, order++]);
    }
    let order = 1;
    for (const c of data.paymentCategories as { name: string; amount: number }[]) {
      const ins = await client.query(
        `insert into payment_categories (name, sort_order) select $1, $2 where not exists (select 1 from payment_categories where lower(name)=lower($1)) returning id`, [c.name, order++]);
      if (ins.rows[0]) // initial price valid from the very first month of the system
        await client.query(`insert into payment_rules (category_id, amount, effective_year, effective_month) values ($1,$2,$3,1)`, [ins.rows[0].id, c.amount, data.systemStartYear]);
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; }

  // Ethiopian payment periods (13 months per year) from the start year up to next year, via the calendar service.
  await ensurePeriods(client as any, data.systemStartYear, currentPeriod().year + 1);
  console.log("✓ initial data ready (ድርጅት፣ ክፍሎች፣ የአባልነት አይነቶች፣ የክፍያ ምድቦች፣ የኢትዮጵያ ክፍያ ወራት)");
}
main().catch((e) => { console.error("✗ seed failed:", e.message); process.exitCode = 1; }).finally(() => client.end());
