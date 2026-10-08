import type { PoolClient } from "pg";
import { z } from "zod";
import { query, tx } from "../db";
import { isValidEthiopianDate } from "../../shared/calendar/ethiopian";
import { currentPeriod } from "../../shared/calendar/payment-period";
import { fromEthiopian, nowEthiopian, toEthiopian } from "../../shared/calendar/ethiopian";
import { audit } from "../lib/audit";
import { generatePassword, hashPassword, SessionUser } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { normalizePhone } from "../lib/phone";
import { encryptSecret } from "../lib/secret-box";
import { assertCategoryHasPrice, generateObligations, repriceOpenObligations } from "./obligations";
import { ord } from "./periods";
import { getSettings } from "./settings";
import { MONTHS_IN_YEAR } from "../../shared/calendar/ethiopian";

export const memberInput = z.object({
  fullName: z.string().trim().min(3, "ሙሉ ስም ያስገቡ።").max(120),
  phone: z.string().trim().min(1, "ስልክ ቁጥር ያስገቡ።"),
  memberTypeId: z.coerce.number().int().positive("የአባልነት አይነት ይምረጡ።"),
  departmentId: z.coerce.number().int().positive("ክፍል ይምረጡ።"),
  categoryId: z.coerce.number().int().positive("የክፍያ ምድብ ይምረጡ።"),
  registeredDate: z.object({ year: z.number().int(), month: z.number().int(), day: z.number().int() }).optional(),
});
export type MemberInput = z.infer<typeof memberInput>;

async function assertLookupsActive(c: PoolClient, i: Pick<MemberInput, "memberTypeId" | "departmentId" | "categoryId">) {
  const checks: [string, number, string][] = [
    ["member_types", i.memberTypeId, "የአባልነት አይነት"], ["service_departments", i.departmentId, "ክፍል"], ["payment_categories", i.categoryId, "የክፍያ ምድብ"],
  ];
  for (const [table, id, label] of checks) {
    const { rows } = await query(`select is_active from ${table} where id = $1`, [id], c);
    if (!rows[0]) throw badRequest(`${label} አልተገኘም።`);
  }
}

export async function createMember(input: MemberInput, actor: SessionUser) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw badRequest("ስልክ ቁጥሩ ትክክል አይደለም። ምሳሌ፦ 0911223344");
  const settings = await getSettings();
  const now = nowEthiopian();
  const reg = input.registeredDate ?? { year: now.year, month: now.month, day: now.day };
  if (!isValidEthiopianDate(reg)) throw badRequest("የመመዝገቢያ ቀን ትክክል አይደለም።");
  if (reg.year < settings.systemStartYear) throw badRequest(`የመመዝገቢያ ቀን ከ${settings.systemStartYear} ዓ.ም. በፊት መሆን አይችልም።`);
  if (fromEthiopian(reg).getTime() > Date.now()) throw badRequest("የመመዝገቢያ ቀን ወደፊት ሊሆን አይችልም።");
  const initialPassword = generatePassword();
  const hash = await hashPassword(initialPassword);

  const member = await tx(async (c) => {
    await assertLookupsActive(c, input);
    await assertCategoryHasPrice(c, input.categoryId);
    const dup = await query("select 1 from users where phone = $1", [phone], c);
    if (dup.rowCount) throw conflict("ይህ ስልክ ቁጥር ቀድሞ ተመዝግቧል።");
    const u = await query(
      `insert into users (role_id, phone, full_name, password_hash, must_change_password, created_by, initial_password_enc, initial_password_at)
       values ((select id from roles where code='MEMBER'), $1, $2, $3, true, $4, $5, now()) returning id`,
      [phone, input.fullName, hash, actor.id, encryptSecret(initialPassword)], c);
    const m = await query(
      `insert into members (user_id, member_type_id, department_id, category_id, registered_at, registered_year, registered_month, registered_day, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, member_code`,
      [u.rows[0].id, input.memberTypeId, input.departmentId, input.categoryId, fromEthiopian(reg), reg.year, reg.month, reg.day, actor.id], c);
    await generateObligations(c, { memberId: m.rows[0].id });
    await audit(c, actor, "MEMBER_REGISTERED", "member", m.rows[0].id, { memberCode: m.rows[0].member_code, name: input.fullName });
    return { id: m.rows[0].id as number, memberCode: m.rows[0].member_code as string };
  });
  return { ...member, fullName: input.fullName, phone, initialPassword };
}

export async function updateMember(id: number, input: MemberInput, actor: SessionUser) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw badRequest("ስልክ ቁጥሩ ትክክል አይደለም። ምሳሌ፦ 0911223344");
  await tx(async (c) => {
    const cur = (await query(
      `select m.*, u.full_name, u.phone from members m join users u on u.id = m.user_id where m.id = $1 for update of m`, [id], c)).rows[0];
    if (!cur) throw notFound();
    await assertLookupsActive(c, input);
    if (input.categoryId !== cur.category_id) await assertCategoryHasPrice(c, input.categoryId);
    const dup = await query("select 1 from users where phone = $1 and id <> $2", [phone, cur.user_id], c);
    if (dup.rowCount) throw conflict("ይህ ስልክ ቁጥር ቀድሞ ተመዝግቧል።");
    await query("update users set full_name=$1, phone=$2, updated_at=now() where id=$3", [input.fullName, phone, cur.user_id], c);
    await query("update members set member_type_id=$1, department_id=$2, category_id=$3, updated_at=now() where id=$4",
      [input.memberTypeId, input.departmentId, input.categoryId, id], c);
    if (input.categoryId !== cur.category_id) {
      const p = currentPeriod();
      await repriceOpenObligations(c, { memberId: id, fromOrd: p.year * MONTHS_IN_YEAR + p.month });
    }
    await audit(c, actor, "MEMBER_UPDATED", "member", id, {
      before: { name: cur.full_name, phone: cur.phone, typeId: cur.member_type_id, deptId: cur.department_id, categoryId: cur.category_id },
      after: { name: input.fullName, phone, typeId: input.memberTypeId, deptId: input.departmentId, categoryId: input.categoryId },
    });
  });
}

export async function setMemberActive(id: number, active: boolean, actor: SessionUser) {
  await tx(async (c) => {
    const m = (await query("select user_id from members where id=$1 for update", [id], c)).rows[0];
    if (!m) throw notFound();
    await query("update members set is_active=$1, updated_at=now() where id=$2", [active, id], c);
    await query("update users set is_active=$1, token_version=token_version+1, updated_at=now() where id=$2", [active, m.user_id], c);
    if (active) {
      const p = currentPeriod(); // no back-billing for the time the member was inactive
      await generateObligations(c, { memberId: id, fromOrd: p.year * MONTHS_IN_YEAR + p.month });
    }
    await audit(c, actor, active ? "MEMBER_ACTIVATED" : "MEMBER_DEACTIVATED", "member", id);
  });
}

export async function resetUserPassword(userId: string, actor: SessionUser, entity: { type: string; id: string | number }) {
  const pw = generatePassword();
  const hash = await hashPassword(pw);
  await tx(async (c) => {
    const r = await query(
      `update users set password_hash=$1, must_change_password=true, token_version=token_version+1,
              failed_attempts=0, locked_until=null, initial_password_enc=$3, initial_password_at=case when $3::text is null then null else now() end, updated_at=now() where id=$2`, [hash, userId, entity.type === "member" ? encryptSecret(pw) : null], c);
    if (!r.rowCount) throw notFound();
    await audit(c, actor, "PASSWORD_RESET", entity.type, entity.id);
  });
  return pw;
}

// ───────── listing ─────────
export interface MemberFilters {
  search?: string; departmentId?: number; memberTypeId?: number; categoryId?: number;
  active?: "1" | "0"; status?: string; page?: number; pageSize?: number;
}

export function searchClause(search: string | undefined, params: unknown[], codeCol = "m.member_code", nameCol = "u.full_name", phoneCol = "u.phone"): string {
  const s = (search ?? "").trim();
  if (!s) return "";
  params.push(`%${s}%`); const like = params.length;
  let sql = `(${nameCol} ilike $${like} or ${codeCol} ilike $${like}`;
  const digits = s.replace(/\D/g, "").replace(/^(251|0)/, "");
  if (digits.length >= 3) { params.push(`%${digits}%`); sql += ` or ${phoneCol} like $${params.length}`; }
  return " and " + sql + ")";
}

export function memberWhere(f: MemberFilters, params: unknown[]): string {
  let w = " where true";
  if (f.departmentId) { params.push(f.departmentId); w += ` and m.department_id = $${params.length}`; }
  if (f.memberTypeId) { params.push(f.memberTypeId); w += ` and m.member_type_id = $${params.length}`; }
  if (f.categoryId) { params.push(f.categoryId); w += ` and m.category_id = $${params.length}`; }
  if (f.active === "1") w += " and m.is_active"; else if (f.active === "0") w += " and not m.is_active";
  if (f.status && ["UNPAID", "PENDING", "PAID", "REJECTED"].includes(f.status)) { params.push(f.status); w += ` and o.status = $${params.length}`; }
  w += searchClause(f.search, params);
  return w;
}

const MEMBER_FROM = `
  from members m
  join users u on u.id = m.user_id
  join member_types mt on mt.id = m.member_type_id
  join service_departments d on d.id = m.department_id
  join payment_categories c on c.id = m.category_id
  left join payment_obligations o on o.member_id = m.id and o.ethiopian_year = $1 and o.ethiopian_month = $2`;

export async function listMembers(f: MemberFilters, paginate = true) {
  const cur = currentPeriod();
  const params: unknown[] = [cur.year, cur.month];
  const where = memberWhere(f, params);
  const page = Math.max(1, f.page ?? 1), size = Math.min(100, Math.max(1, f.pageSize ?? 25));
  const total = (await query(`select count(*)::int n ${MEMBER_FROM} ${where}`, params)).rows[0].n as number;
  const limit = paginate ? ` limit ${size} offset ${(page - 1) * size}` : " limit 20000";
  const { rows } = await query(
    `select m.id, m.member_code, u.full_name, u.phone, m.is_active, mt.name as member_type, d.name as department, c.name as category,
            m.member_type_id, m.department_id, m.category_id, m.registered_year, m.registered_month, m.registered_day,
            o.status as current_status, o.amount as current_amount
       ${MEMBER_FROM} ${where} order by m.member_code${limit}`, params);
  return { total, page, pageSize: size, rows };
}

export async function getMember(id: number) {
  const { rows } = await query(
    `select m.id, m.member_code, u.id as user_id, u.full_name, u.phone, m.is_active, u.must_change_password, u.last_login_at,
            mt.name as member_type, d.name as department, c.name as category,
            m.member_type_id, m.department_id, m.category_id, m.registered_year, m.registered_month, m.registered_day
       from members m join users u on u.id=m.user_id join member_types mt on mt.id=m.member_type_id
       join service_departments d on d.id=m.department_id join payment_categories c on c.id=m.category_id
      where m.id=$1`, [id]);
  if (!rows[0]) throw notFound();
  return rows[0];
}
export { toEthiopian };
