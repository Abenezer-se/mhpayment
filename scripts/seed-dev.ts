/**
 * DEVELOPMENT ONLY demo data (fake members & payments). Never run this on the production database.
 *   npm run seed:dev
 * Requires the admin to exist (npm run create-admin) and the normal seed to have run.
 */
import pg from "pg";
import { generatePassword } from "../server/lib/auth";
import { createMember, memberInput } from "../server/services/members";
import { recordStaffPayment } from "../server/services/payments";
import { query } from "../server/db";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL አልተቀመጠም"); process.exit(1); }
if (process.env.NODE_ENV === "production" || (/neon\.tech/.test(url) && !process.argv.includes("--i-know-this-is-not-production"))) {
  console.error("✗ ይህ ስክሪፕት ለልማት ብቻ ነው። ከእውነተኛ (production) ዳታቤዝ ጋር አይሰራም።"); process.exit(1);
}
const names = ["አቤነዘር ሳምሶን", "ሳራ ተስፋዬ", "ዮሐንስ ገብረ", "ማርታ ኃይሉ", "ዳዊት በቀለ", "ሩት አበበ", "ኤልያስ ታደሰ", "ሄርሞን ወልዴ", "ቅድስት ዘለቀ", "ኖኅ መንግሥቱ"];
async function main() {
  const admin = (await query(`select u.id, u.full_name from users u join roles r on r.id=u.role_id where r.code='ADMIN' limit 1`)).rows[0];
  if (!admin) throw new Error("መጀመሪያ አስተዳዳሪ ይፍጠሩ: npm run create-admin");
  const actor = { id: admin.id, fullName: admin.full_name, role: "ADMIN", phone: "", mustChangePassword: false, memberId: null, memberCode: null } as any;
  const lk = async (t: string) => (await query(`select id from ${t} where is_active order by id`)).rows.map((r) => r.id as number);
  const [depts, types, cats] = [await lk("service_departments"), await lk("member_types"), await lk("payment_categories")];
  const base = 900000 + Math.floor(Math.random() * 90000);
  for (let i = 0; i < names.length; i++) {
    const m = await createMember(memberInput.parse({ fullName: names[i], phone: `09${base + i}`.slice(0, 10), memberTypeId: types[i % types.length], departmentId: depts[i % depts.length], categoryId: cats[i % cats.length] }), actor);
    if (i % 2 === 0) {
      const ob = (await query(`select id from payment_obligations where member_id=$1 order by ethiopian_year, ethiopian_month limit 2`, [m.id])).rows.map((r) => r.id);
      await recordStaffPayment(actor, { memberId: m.id, obligationIds: ob, method: i % 4 === 0 ? "CASH" : "MOBILE_BANKING" });
    }
    console.log(`  ${m.memberCode}  ${names[i]}  ስልክ ${m.phone}  የይለፍ ቃል ${m.initialPassword}`);
  }
  void generatePassword; void pg;
  console.log("✓ የሙከራ ዳታ ተፈጥሯል");
}
main().catch((e) => { console.error("✗", e.message); process.exitCode = 1; }).finally(() => process.exit());
