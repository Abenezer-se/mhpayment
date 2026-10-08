import { query, tx } from "../db";
import { audit } from "../lib/audit";
import { generatePassword, hashPassword, SessionUser } from "../lib/auth";
import { conflict, notFound } from "../lib/errors";
import { decryptSecret, encryptSecret } from "../lib/secret-box";
import { searchClause } from "./members";

export interface CredFilters { search?: string; departmentId?: number; categoryId?: number; credStatus?: "pending" | "changed"; page?: number; pageSize?: number }

const FROM = `from members m
  join users u on u.id = m.user_id
  join service_departments d on d.id = m.department_id
  join payment_categories c on c.id = m.category_id`;

function whereOf(f: CredFilters, params: unknown[]) {
  let w = " where m.is_active";
  if (f.departmentId) { params.push(f.departmentId); w += ` and m.department_id = $${params.length}`; }
  if (f.categoryId) { params.push(f.categoryId); w += ` and m.category_id = $${params.length}`; }
  if (f.credStatus === "pending") w += " and u.must_change_password";
  else if (f.credStatus === "changed") w += " and not u.must_change_password";
  return w + searchClause(f.search, params);
}

/** The member list. The list NEVER carries passwords; only the export (withPasswords) decrypts the still-valid temporary ones. */
export async function listCredentials(f: CredFilters, opts: { paginate?: boolean; withPasswords?: boolean } = {}) {
  const params: unknown[] = [];
  const w = whereOf(f, params);
  const page = Math.max(1, f.page ?? 1), size = Math.min(100, Math.max(1, f.pageSize ?? 25));
  const total = (await query(`select count(*)::int as n ${FROM} ${w}`, params)).rows[0].n as number;
  const limit = opts.paginate === false ? " limit 20000" : ` limit ${size} offset ${(page - 1) * size}`;
  const raw = (await query(
    `select m.id, m.member_code, u.full_name, u.phone, d.name as department, c.name as category, u.must_change_password,
            (u.initial_password_enc is not null) as has_initial${opts.withPasswords ? ", u.initial_password_enc" : ""}
       ${FROM} ${w} order by m.member_code${limit}`, params)).rows;
  const rows = raw.map((r: any) => {
    const { initial_password_enc, ...rest } = r;
    return opts.withPasswords ? { ...rest, initial_password: r.must_change_password ? decryptSecret(initial_password_enc) : null } : rest;
  });
  const missing = (await query(
    `select count(*)::int as n from members m join users u on u.id = m.user_id
      where m.is_active and u.must_change_password and u.initial_password_enc is null`)).rows[0].n as number;
  return { total, page, pageSize: size, rows, missingCount: missing };
}

export async function revealInitialPassword(memberId: number, actor: SessionUser) {
  const r = (await query(
    `select u.must_change_password, u.initial_password_enc from members m join users u on u.id = m.user_id where m.id = $1`, [memberId])).rows[0];
  if (!r) throw notFound();
  if (!r.must_change_password) throw conflict("የይለፍ ቃል ተቀይሯል። የአባሉ የግል ይለፍ ቃል አይታይም።");
  const pw = decryptSecret(r.initial_password_enc);
  if (!pw) throw notFound("የመጀመሪያ ይለፍ ቃል አልተቀመጠም። እባክዎ አዲስ ይፍጠሩ።");
  await audit((await import("../db")).getPool(), actor, "CREDENTIAL_VIEWED", "member", memberId);
  return pw;
}

/**
 * Members registered before this feature have no stored temporary password. This creates a NEW one for those who have
 * not changed their password yet (in small batches: password hashing is slow and serverless calls are time-limited).
 */
export async function generateMissing(actor: SessionUser, limit = 25) {
  const ids = (await query(
    `select m.id, m.user_id from members m join users u on u.id = m.user_id
      where m.is_active and u.must_change_password and u.initial_password_enc is null order by m.id limit $1`, [limit])).rows;
  const prepared: { userId: string; enc: string; hash: string }[] = [];
  for (const r of ids) { const pw = generatePassword(); prepared.push({ userId: r.user_id, enc: encryptSecret(pw), hash: await hashPassword(pw) }); }
  await tx(async (c) => {
    for (const p of prepared)
      await query(
        `update users set password_hash = $1, must_change_password = true, token_version = token_version + 1, failed_attempts = 0, locked_until = null,
                initial_password_enc = $2, initial_password_at = now(), updated_at = now() where id = $3`, [p.hash, p.enc, p.userId], c);
    if (prepared.length) await audit(c, actor, "CREDENTIALS_GENERATED", "member-list", undefined, { count: prepared.length });
  });
  const remaining = (await query(
    `select count(*)::int as n from members m join users u on u.id = m.user_id where m.is_active and u.must_change_password and u.initial_password_enc is null`)).rows[0].n as number;
  return { generated: prepared.length, remaining };
}