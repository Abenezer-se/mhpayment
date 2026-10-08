/**
 * Creates (or resets) the main administrator.
 *   npm run create-admin -- --phone 0911223344 --name "ሙሉ ስም" [--password "..."]
 * If --password is omitted a strong one is generated and printed ONCE.
 */
import pg from "pg";
import { generatePassword, hashPassword } from "../server/lib/auth";
import { normalizePhone } from "../server/lib/phone";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL አልተቀመጠም"); process.exit(1); }
const phone = normalizePhone(arg("phone") ?? "");
if (!phone) { console.error('ስልክ ቁጥር ያስፈልጋል: npm run create-admin -- --phone 0911223344 --name "ስም"'); process.exit(1); }
const name = arg("name") ?? "ዋና አስተዳዳሪ";
const generated = !arg("password");
const password = arg("password") ?? generatePassword(12);
if (password.length < 8) { console.error("የይለፍ ቃል ቢያንስ 8 ፊደላት መሆን አለበት።"); process.exit(1); }

const client = new pg.Client({ connectionString: url });
async function main() {
  await client.connect();
  const hash = await hashPassword(password);
  const r = await client.query(
    `insert into users (role_id, phone, full_name, password_hash, must_change_password)
     values ((select id from roles where code='ADMIN'), $1, $2, $3, $4)
     on conflict (phone) do update set password_hash = excluded.password_hash, must_change_password = excluded.must_change_password,
       token_version = users.token_version + 1, failed_attempts = 0, locked_until = null, is_active = true
       where users.role_id = (select id from roles where code='ADMIN')
     returning id`, [phone, name, hash, generated]);
  if (!r.rows[0]) throw new Error("ይህ ስልክ ቁጥር የሌላ ተጠቃሚ ነው።");
  console.log(`✓ አስተዳዳሪ ዝግጁ ነው\n  ስልክ:      ${phone}\n  የይለፍ ቃል:  ${password}${generated ? "\n  (ይህ አንድ ጊዜ ብቻ ነው የሚታየው — በመጀመሪያ ግብዓት ላይ እንዲቀይሩ ይጠየቃሉ)" : ""}`);
}
main().catch((e) => { console.error("✗", e.message); process.exitCode = 1; }).finally(() => client.end());
