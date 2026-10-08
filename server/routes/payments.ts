import { Router } from "express";
import { z } from "zod";
import { query } from "../db";
import { memberOnly, requireAuth, staffOnly, adminOnly } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { storage } from "../lib/storage";
import { approvePayment, getTransaction, listTransactions, recordStaffPayment, rejectPayment, submitMemberPayment, voidPayment } from "../services/payments";
import { birr, buildConfirmationPdf, labelMethod, render, TableSpec } from "../services/exports";
import { dashboard } from "../services/reports";
import { ensureYearGenerated } from "../services/obligations";
import { formatInstant, formatPeriod } from "../../shared/calendar/ethiopian";
import { TX_STATUS_LABEL } from "../../shared/labels";
import { currentPeriod } from "../../shared/calendar/payment-period";
import { idParam, intOrUndef, parseFilters, sendFile, upload, wrap } from "./util";
import { memberObligations } from "./members";

export const paymentsApi = Router();   // /api/payments  (staff + shared file access)
export const meApi = Router();         // /api/me        (the logged-in member only)
export const dashboardApi = Router();  // /api/dashboard (staff)

const idsFrom = (raw: unknown): number[] => {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { throw badRequest(); } }
  const parsed = z.array(z.coerce.number().int().positive()).min(1, "ቢያንስ አንድ ወር ይምረጡ።").max(60).safeParse(v);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message);
  return parsed.data;
};

const txFilters = (q: any) => {
  const f = parseFilters(q);
  return {
    status: typeof q.txStatus === "string" && q.txStatus && q.txStatus !== "all" ? q.txStatus : undefined,
    method: f.method, search: f.search, departmentId: f.departmentId, categoryId: f.categoryId,
    year: f.year, month: f.month, dateFrom: f.dateFrom, dateTo: f.dateTo, page: f.page, pageSize: f.pageSize,
    memberId: intOrUndef(q.memberId),
  };
};

// ───────── staff dashboard ─────────
dashboardApi.get("/", staffOnly, wrap(async (_req, res) => {
  await ensureYearGenerated();
  const [stats, recent, pending] = await Promise.all([
    dashboard(),
    listTransactions({ status: "VERIFIED", pageSize: 6 }),
    listTransactions({ status: "PENDING", pageSize: 6 }, { order: "asc" }),
  ]);
  res.json({ ...stats, recent: recent.rows, pending: pending.rows });
}));

// ───────── staff: list / review ─────────
paymentsApi.get("/", staffOnly, wrap(async (req, res) => res.json(await listTransactions(txFilters(req.query)))));

paymentsApi.get("/export", staffOnly, wrap(async (req, res) => {
  const { rows, total } = await listTransactions(txFilters(req.query), { paginate: false });
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const spec: TableSpec = {
    title: "የክፍያ ታሪክ", fileBase: "የክፍያ-ታሪክ", landscape: true, filterLines: [`ጠቅላላ ግብይቶች፦ ${total}`],
    columns: [
      { header: "የማረጋገጫ ቁጥር", key: "ref", width: 14 }, { header: "የክፍያ ቀን", key: "date", width: 18 }, { header: "የአባል መለያ", key: "code", width: 11 },
      { header: "ስም", key: "name", width: 22 }, { header: "ክፍል", key: "dept", width: 20 }, { header: "የተከፈለባቸው ወራት", key: "months", width: 30 },
      { header: "መጠን (ብር)", key: "amount", width: 12, type: "money" }, { header: "የክፍያ ዘዴ", key: "method", width: 12 }, { header: "ሁኔታ", key: "status", width: 12 },
    ],
    rows: rows.map((r) => ({
      ref: r.reference_no, date: formatInstant(r.paid_at, true), code: r.member_code, name: r.full_name, dept: r.department,
      months: (r.items ?? []).map((i: any) => formatPeriod(i.year, i.month)).join("፣ "), amount: r.amount,
      method: labelMethod(r.method), status: TX_STATUS_LABEL[r.status] ?? r.status,
    })),
    totals: { ref: "ጠቅላላ (የተረጋገጡ)", amount: rows.filter((r) => r.status === "VERIFIED").reduce((s, r) => s + Number(r.amount), 0) },
  };
  const out = await render(spec, format);
  sendFile(res, out.buffer, out.mime, out.filename);
}));

const recordBody = z.object({
  memberId: z.coerce.number().int().positive(), method: z.enum(["CASH", "MOBILE_BANKING"], { message: "የክፍያ ዘዴ ይምረጡ።" }),
  amount: z.coerce.number().min(0).optional(), note: z.string().trim().max(300).optional(),
});
paymentsApi.post("/record", staffOnly, upload().single("proof"), wrap(async (req, res) => {
  const b = recordBody.parse({ ...req.body, amount: req.body.amount === "" ? undefined : req.body.amount });
  const r = await recordStaffPayment(req.user!, {
    memberId: b.memberId, obligationIds: idsFrom(req.body.obligationIds), method: b.method, amount: b.amount, note: b.note,
    file: req.file ? { buffer: req.file.buffer, originalName: req.file.originalname } : undefined,
  });
  res.status(201).json({ ...r, message: "ክፍያው ተመዝግቧል።" });
}));

// ───────── shared reads: staff OR the owning member ─────────
async function ownedTransaction(req: any) {
  const t = await getTransaction(idParam(req.params.id));
  if (req.user.role === "MEMBER" && t.member_id !== req.user.memberId) throw notFound(); // never reveal that it exists
  return t;
}

paymentsApi.get("/:id", requireAuth, wrap(async (req, res) => {
  if (req.user!.mustChangePassword) throw badRequest("እባክዎ መጀመሪያ የይለፍ ቃልዎን ይቀይሩ።");
  res.json(await ownedTransaction(req));
}));

paymentsApi.get("/:id/proof", requireAuth, wrap(async (req, res) => {
  const t = await ownedTransaction(req);
  const proofId = intOrUndef(req.query.proofId) ?? t.proofList[0]?.id;
  const p = (await query("select * from payment_proofs where id=$1 and transaction_id=$2", [proofId, t.id])).rows[0];
  if (!p) throw notFound();
  const buf = await storage().get(p.storage_key);
  if (!buf) throw notFound();
  sendFile(res, buf, p.mime_type, p.original_name || `proof.${p.mime_type.split("/")[1]}`, true);
}));

paymentsApi.get("/:id/confirmation", requireAuth, wrap(async (req, res) => {
  const t = await ownedTransaction(req);
  if (t.status !== "VERIFIED") throw badRequest("የክፍያ ማረጋገጫ ሰነድ ለተረጋገጡ ክፍያዎች ብቻ ይሰጣል።");
  const pdf = await buildConfirmationPdf({
    referenceNo: t.reference_no, fullName: t.full_name, memberCode: t.member_code, phone: t.phone, department: t.department, category: t.category,
    method: t.method, status: t.status, amount: Number(t.amount), paidAt: t.paid_at, reviewedAt: t.reviewed_at, items: t.items ?? [],
  });
  sendFile(res, pdf, "application/pdf", `${t.reference_no}.pdf`, req.query.inline === "1");
}));

paymentsApi.post("/:id/approve", staffOnly, wrap(async (req, res) => { await approvePayment(idParam(req.params.id), req.user!); res.json({ message: "ክፍያው ተረጋግጧል።" }); }));
paymentsApi.post("/:id/reject", staffOnly, wrap(async (req, res) => {
  const b = z.object({ reason: z.string().min(1, "እባክዎ የውድቅ መሆን ምክንያቱን ይጻፉ።") }).parse(req.body);
  await rejectPayment(idParam(req.params.id), b.reason, req.user!); res.json({ message: "ክፍያው ውድቅ ተደርጓል።" });
}));
paymentsApi.post("/:id/void", adminOnly, wrap(async (req, res) => {
  const b = z.object({ reason: z.string().min(1, "እባክዎ የመሰረዝ ምክንያቱን ይጻፉ።") }).parse(req.body);
  await voidPayment(idParam(req.params.id), b.reason, req.user!); res.json({ message: "የክፍያ ማረጋገጫው ተሰርዟል።" });
}));

// ───────── the logged-in member ─────────
meApi.use(memberOnly);

meApi.get("/dashboard", wrap(async (req, res) => {
  await ensureYearGenerated();
  const cur = currentPeriod();
  const year = intOrUndef(req.query.year) ?? cur.year;
  const rows = await memberObligations(req.user!.memberId!, year);
  const sum = (pred: (r: any) => boolean) => rows.filter(pred).reduce((s, r) => s + Number(r.amount), 0);
  const count = (pred: (r: any) => boolean) => rows.filter(pred).length;
  const open = (r: any) => r.status === "UNPAID" || r.status === "REJECTED";
  const thisMonth = rows.find((r) => r.ethiopian_month === cur.month && year === cur.year) ?? null;
  const rejected = (await query(
    `select t.id, t.reference_no, t.reject_reason, t.reviewed_at from payment_transactions t
      where t.member_id=$1 and t.status='REJECTED'
        and exists (select 1 from payment_transaction_items i join payment_obligations o on o.id=i.obligation_id
                     where i.transaction_id=t.id and o.status='REJECTED')
      order by t.id desc limit 3`, [req.user!.memberId])).rows;
  const info = (await query(
    `select m.member_code, u.full_name, d.name as department, c.name as category, mt.name as member_type
       from members m join users u on u.id=m.user_id join service_departments d on d.id=m.department_id
       join payment_categories c on c.id=m.category_id join member_types mt on mt.id=m.member_type_id where m.id=$1`, [req.user!.memberId])).rows[0];
  res.json({
    year, current: cur, info, thisMonth, rejected,
    counts: { paid: count((r) => r.status === "PAID"), pending: count((r) => r.status === "PENDING"), unpaid: count(open) },
    totals: { expected: sum(() => true), paid: sum((r) => r.status === "PAID"), pending: sum((r) => r.status === "PENDING"), unpaid: sum(open) },
    rows,
  });
}));

meApi.get("/obligations", wrap(async (req, res) => {
  await ensureYearGenerated();
  res.json({ rows: await memberObligations(req.user!.memberId!, intOrUndef(req.query.year) ?? currentPeriod().year) });
}));

meApi.get("/payments", wrap(async (req, res) => {
  const f = parseFilters(req.query);
  res.json(await listTransactions({ memberId: req.user!.memberId!, page: f.page, pageSize: f.pageSize ?? 20 }));
}));

meApi.post("/payments", upload().single("proof"), wrap(async (req, res) => {
  const r = await submitMemberPayment(req.user!, idsFrom(req.body.obligationIds), req.file ? { buffer: req.file.buffer, originalName: req.file.originalname } : undefined);
  res.status(201).json({ ...r, message: "የክፍያ ማረጋገጫዎ ገብቷል። በማረጋገጥ ላይ ነው።" });
}));
void birr;
