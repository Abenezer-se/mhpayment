import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { Db, query, tx } from "../db";
import { etRangeToInstants, paymentDateFields } from "../../shared/calendar/payment-period";
import { EtDate, isValidEthiopianDate } from "../../shared/calendar/ethiopian";
import { audit } from "../lib/audit";
import type { SessionUser } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { detectFileType, storage } from "../lib/storage";
import { env } from "../config";
import { searchClause } from "./members";

export type PayMethod = "CASH" | "MOBILE_BANKING";
export interface UploadedFile { buffer: Buffer; originalName: string }

const ALREADY_PAID = "ይህ ወር ቀድሞ ተከፍሏል።";
const ALREADY_PENDING = "ለዚህ ወር የክፍያ ማረጋገጫ ቀድሞ ገብቷል፤ በማረጋገጥ ላይ ነው።";

// ───────── proof file ─────────
async function storeProof(file: UploadedFile) {
  if (file.buffer.length > env.maxUploadBytes) throw badRequest(`ፋይሉ ከ${Math.round(env.maxUploadBytes / 1048576)} ሜጋባይት መብለጥ የለበትም።`);
  const type = detectFileType(file.buffer);
  if (!type) throw badRequest("የሚቀበለው JPG፣ PNG፣ WebP ወይም PDF ፋይል ብቻ ነው።");
  const key = `proofs/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${type.ext}`;
  await storage().put(key, file.buffer);
  return { key, mime: type.mime, size: file.buffer.length, sha256: crypto.createHash("sha256").update(file.buffer).digest("hex") };
}
type StoredProof = Awaited<ReturnType<typeof storeProof>>;

async function insertProof(c: PoolClient, txId: number, p: StoredProof, name: string, userId: string) {
  await query(
    `insert into payment_proofs (transaction_id, storage_key, original_name, mime_type, size_bytes, sha256, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7)`,
    [txId, p.key, name.slice(0, 200), p.mime, p.size, p.sha256, userId], c);
}

// ───────── shared helpers ─────────
async function lockOpenObligations(c: PoolClient, memberId: number, ids: number[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) throw badRequest("ቢያንስ አንድ ወር ይምረጡ።");
  const { rows } = await query(
    `select id, status, amount from payment_obligations where id = any($1::bigint[]) and member_id = $2 order by id for update`, [unique, memberId], c);
  if (rows.length !== unique.length) throw notFound("የተመረጠው ወር አልተገኘም።");
  for (const r of rows) {
    if (r.status === "PAID") throw conflict(ALREADY_PAID);
    if (r.status === "PENDING") throw conflict(ALREADY_PENDING);
  }
  const total = Math.round(rows.reduce((s, r) => s + Number(r.amount) * 100, 0)) / 100;
  return { ids: unique, total };
}

async function insertTransaction(c: PoolClient, v: {
  memberId: number; amount: number; method: PayMethod; source: "MEMBER_PROOF" | "STAFF_RECORDED";
  status: "PENDING" | "VERIFIED"; createdBy: string; note?: string | null;
}) {
  const paidAt = new Date();
  const e = paymentDateFields(paidAt);
  const { rows } = await query(
    `insert into payment_transactions (member_id, amount, method, source, status, note, created_by, reviewed_by, reviewed_at, paid_at,
                                       ethiopian_year, ethiopian_month, ethiopian_day)
     values ($1,$2,$3,$4,$5,$6,$7, $8, $9, $10, $11,$12,$13) returning id, reference_no`,
    [v.memberId, v.amount, v.method, v.source, v.status, v.note ?? null, v.createdBy,
     v.status === "VERIFIED" ? v.createdBy : null, v.status === "VERIFIED" ? paidAt : null, paidAt,
     e.ethiopian_year, e.ethiopian_month, e.ethiopian_day], c);
  return rows[0] as { id: number; reference_no: string };
}

async function attachItems(c: PoolClient, txId: number, ids: number[], newStatus: "PENDING" | "PAID") {
  try {
    await query(`insert into payment_transaction_items (transaction_id, obligation_id, amount)
                 select $1, id, amount from payment_obligations where id = any($2::bigint[])`, [txId, ids], c);
  } catch (e: any) {
    if (e.code === "23505") throw conflict(ALREADY_PAID); // DB-level duplicate protection
    throw e;
  }
  await query(`update payment_obligations set status=$2, updated_at=now() where id = any($1::bigint[])`, [ids, newStatus], c);
}

// ───────── Method A: member uploads a screenshot → PENDING ─────────
export async function submitMemberPayment(actor: SessionUser, obligationIds: number[], file: UploadedFile | undefined) {
  if (!actor.memberId) throw badRequest();
  if (!file) throw badRequest("የክፍያ ማረጋገጫ ምስሉ አልተጫነም።");
  const stored = await storeProof(file);
  try {
    return await tx(async (c) => {
      const { ids, total } = await lockOpenObligations(c, actor.memberId!, obligationIds);
      const t = await insertTransaction(c, { memberId: actor.memberId!, amount: total, method: "MOBILE_BANKING", source: "MEMBER_PROOF", status: "PENDING", createdBy: actor.id });
      await attachItems(c, t.id, ids, "PENDING");
      await insertProof(c, t.id, stored, file.originalName, actor.id);
      await audit(c, actor, "PAYMENT_SUBMITTED", "payment", t.id, { ref: t.reference_no, amount: total, months: ids.length });
      return { id: t.id, referenceNo: t.reference_no, amount: total };
    });
  } catch (e) { await storage().delete(stored.key); throw e; }
}

// ───────── Methods B & C: staff records cash / mobile banking → VERIFIED immediately ─────────
export async function recordStaffPayment(actor: SessionUser, v: {
  memberId: number; obligationIds: number[]; method: PayMethod; amount?: number; note?: string; file?: UploadedFile;
}) {
  const stored = v.file ? await storeProof(v.file) : null;
  try {
    return await tx(async (c) => {
      const m = (await query("select is_active from members where id=$1", [v.memberId], c)).rows[0];
      if (!m) throw notFound();
      const { ids, total } = await lockOpenObligations(c, v.memberId, v.obligationIds);
      if (v.amount !== undefined && Math.abs(v.amount - total) > 0.001)
        throw badRequest(`የገባው መጠን (${v.amount} ብር) ከተመረጡት ወራት ድምር (${total} ብር) ጋር አይመሳሰልም።`);
      const t = await insertTransaction(c, { memberId: v.memberId, amount: total, method: v.method, source: "STAFF_RECORDED", status: "VERIFIED", createdBy: actor.id, note: v.note });
      await attachItems(c, t.id, ids, "PAID");
      if (stored && v.file) await insertProof(c, t.id, stored, v.file.originalName, actor.id);
      await audit(c, actor, "PAYMENT_RECORDED", "payment", t.id, { ref: t.reference_no, amount: total, method: v.method, memberId: v.memberId, months: ids.length });
      return { id: t.id, referenceNo: t.reference_no, amount: total };
    });
  } catch (e) { if (stored) await storage().delete(stored.key); throw e; }
}

// ───────── review ─────────
async function lockPendingTx(c: PoolClient, id: number) {
  const t = (await query("select * from payment_transactions where id=$1 for update", [id], c)).rows[0];
  if (!t) throw notFound();
  if (t.status !== "PENDING") throw conflict("ይህ ክፍያ ቀድሞ ታይቷል።");
  return t;
}

export async function approvePayment(id: number, actor: SessionUser) {
  await tx(async (c) => {
    const t = await lockPendingTx(c, id);
    const items = (await query(
      `select o.id, o.status from payment_transaction_items i join payment_obligations o on o.id=i.obligation_id
        where i.transaction_id=$1 and i.is_active order by o.id for update of o`, [id], c)).rows;
    if (!items.length) throw conflict("የክፍያው ወራት አልተገኙም።");
    if (items.some((r) => r.status === "PAID")) throw conflict(ALREADY_PAID);
    if (items.some((r) => r.status !== "PENDING")) throw conflict("የክፍያው ሁኔታ ተቀይሯል። እባክዎ ገጹን ያድሱ።");
    await query(`update payment_obligations set status='PAID', updated_at=now() where id = any($1::bigint[])`, [items.map((r) => r.id)], c);
    await query(`update payment_transactions set status='VERIFIED', reviewed_by=$2, reviewed_at=now() where id=$1`, [id, actor.id], c);
    await audit(c, actor, "PAYMENT_APPROVED", "payment", id, { ref: t.reference_no, amount: Number(t.amount) });
  });
}

async function releaseObligations(c: PoolClient, id: number, newStatus: "REJECTED" | "UNPAID") {
  await query(
    `update payment_obligations set status=$2, updated_at=now()
      where id in (select obligation_id from payment_transaction_items where transaction_id=$1 and is_active)`, [id, newStatus], c);
  await query(`update payment_transaction_items set is_active=false where transaction_id=$1`, [id], c);
}

export async function rejectPayment(id: number, reason: string, actor: SessionUser) {
  if (reason.trim().length < 3) throw badRequest("እባክዎ የውድቅ መሆን ምክንያቱን ይጻፉ።");
  await tx(async (c) => {
    const t = await lockPendingTx(c, id);
    await releaseObligations(c, id, "REJECTED");
    await query(`update payment_transactions set status='REJECTED', reject_reason=$2, reviewed_by=$3, reviewed_at=now() where id=$1`, [id, reason.trim(), actor.id], c);
    await audit(c, actor, "PAYMENT_REJECTED", "payment", id, { ref: t.reference_no, reason: reason.trim() });
  });
}

/** Admin-only correction of a verified payment: months become unpaid again; the record stays for audit. */
export async function voidPayment(id: number, reason: string, actor: SessionUser) {
  if (reason.trim().length < 3) throw badRequest("እባክዎ የመሰረዝ ምክንያቱን ይጻፉ።");
  await tx(async (c) => {
    const t = (await query("select * from payment_transactions where id=$1 for update", [id], c)).rows[0];
    if (!t) throw notFound();
    if (t.status !== "VERIFIED") throw conflict("የተረጋገጠ ክፍያ ብቻ ነው መሰረዝ የሚቻለው።");
    await releaseObligations(c, id, "UNPAID");
    await query(`update payment_transactions set status='VOIDED', reject_reason=$2, reviewed_by=$3, reviewed_at=now() where id=$1`, [id, reason.trim(), actor.id], c);
    await audit(c, actor, "PAYMENT_VOIDED", "payment", id, { ref: t.reference_no, reason: reason.trim() });
  });
}

// ───────── reading ─────────
export interface TxFilters {
  status?: string; method?: string; search?: string; memberId?: number; departmentId?: number; categoryId?: number;
  year?: number; month?: number; dateFrom?: EtDate; dateTo?: EtDate; page?: number; pageSize?: number; source?: string;
}

const TX_SELECT = `
  select t.id, t.reference_no, t.amount, t.method, t.source, t.status, t.note, t.reject_reason, t.paid_at, t.created_at, t.reviewed_at,
         t.ethiopian_year, t.ethiopian_month, t.ethiopian_day,
         m.id as member_id, m.member_code, u.full_name, u.phone, d.name as department, c.name as category,
         rv.full_name as reviewed_by_name,
         (select json_agg(json_build_object('year', o.ethiopian_year, 'month', o.ethiopian_month, 'amount', i.amount) order by o.ethiopian_year, o.ethiopian_month)
            from payment_transaction_items i join payment_obligations o on o.id = i.obligation_id where i.transaction_id = t.id) as items,
         (select count(*) from payment_proofs pr where pr.transaction_id = t.id)::int as proofs
    from payment_transactions t
    join members m on m.id = t.member_id
    join users u on u.id = m.user_id
    join service_departments d on d.id = m.department_id
    join payment_categories c on c.id = m.category_id
    left join users rv on rv.id = t.reviewed_by`;

export async function listTransactions(f: TxFilters, opts: { paginate?: boolean; order?: "asc" | "desc" } = {}) {
  const params: unknown[] = [];
  let w = " where true";
  const eq = (col: string, val: unknown) => { params.push(val); w += ` and ${col} = $${params.length}`; };
  if (f.status) eq("t.status", f.status);
  if (f.method) eq("t.method", f.method);
  if (f.source) eq("t.source", f.source);
  if (f.memberId) eq("t.member_id", f.memberId);
  if (f.departmentId) eq("m.department_id", f.departmentId);
  if (f.categoryId) eq("m.category_id", f.categoryId);
  if (f.year) eq("t.ethiopian_year", f.year);
  if (f.month) eq("t.ethiopian_month", f.month);
  const range = etRangeToInstants(
    f.dateFrom && isValidEthiopianDate(f.dateFrom) ? f.dateFrom : null, f.dateTo && isValidEthiopianDate(f.dateTo) ? f.dateTo : null);
  if (range.from) { params.push(range.from); w += ` and t.paid_at >= $${params.length}`; }
  if (range.toExclusive) { params.push(range.toExclusive); w += ` and t.paid_at < $${params.length}`; }
  w += searchClause(f.search, params);
  const page = Math.max(1, f.page ?? 1), size = Math.min(100, Math.max(1, f.pageSize ?? 25));
  const base = ` from payment_transactions t join members m on m.id=t.member_id join users u on u.id=m.user_id${w ? "" : ""}`;
  const total = (await query(`select count(*)::int n ${base} ${w}`, params)).rows[0].n as number;
  const dir = opts.order === "asc" ? "asc" : "desc";
  const limit = opts.paginate === false ? " limit 20000" : ` limit ${size} offset ${(page - 1) * size}`;
  const { rows } = await query(`${TX_SELECT} ${w} order by t.paid_at ${dir}, t.id ${dir}${limit}`, params);
  return { total, page, pageSize: size, rows };
}

export async function getTransaction(id: number, db: Db = undefined as any) {
  const { rows } = await query(`${TX_SELECT} where t.id = $1`, [id], db);
  if (!rows[0]) throw notFound();
  const proofs = (await query(`select id, mime_type, size_bytes, original_name, created_at from payment_proofs where transaction_id=$1 order by id`, [id], db)).rows;
  return { ...rows[0], proofList: proofs };
}
