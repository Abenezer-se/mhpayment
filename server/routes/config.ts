import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../db";
import { audit } from "../lib/audit";
import { adminOnly, staffOnly, hashPassword, generatePassword } from "../lib/auth";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { detectFileType, storage } from "../lib/storage";
import { normalizePhone } from "../lib/phone";
import { applicableAmount, generateObligations, repriceOpenObligations } from "../services/obligations";
import { ensureCurrentPeriods, ord } from "../services/periods";
import { getSettings, setSetting } from "../services/settings";
import { resetUserPassword } from "../services/members";
import { currentPeriod, comparePeriods } from "../../shared/calendar/payment-period";
import { MONTHS_IN_YEAR } from "../../shared/calendar/ethiopian";
import { idParam, upload, wrap, intOrUndef } from "./util";

export const configApi = Router();

const KINDS = {
  departments: { table: "service_departments", fk: "department_id", label: "ክፍል" },
  "member-types": { table: "member_types", fk: "member_type_id", label: "የአባልነት አይነት" },
  categories: { table: "payment_categories", fk: "category_id", label: "የክፍያ ምድብ" },
} as const;
type Kind = keyof typeof KINDS;
const kindOf = (v: unknown): Kind => { if (typeof v === "string" && v in KINDS) return v as Kind; throw notFound(); };

// ───────── read all lookups (used by every dropdown) ─────────
configApi.get("/lookups", staffOnly, wrap(async (_req, res) => {
  const cur = currentPeriod();
  const usage = async (kind: Kind) => (await query(
    `select x.id, x.name, x.is_active, x.sort_order, (select count(*)::int from members m where m.${KINDS[kind].fk} = x.id) as members
       from ${KINDS[kind].table} x order by x.sort_order, x.name`)).rows;
  const categories = await usage("categories");
  for (const c of categories) c.amount = await applicableAmount(await import("../db").then((m) => m.getPool()), c.id, cur.year, cur.month);
  res.json({ departments: await usage("departments"), memberTypes: await usage("member-types"), categories });
}));

// ───────── generic create / update / delete (admin) ─────────
const nameBody = z.object({ name: z.string().trim().min(2, "ስም ያስገቡ።").max(80), isActive: z.boolean().optional(), sortOrder: z.number().int().optional() });

configApi.post("/:kind", adminOnly, wrap(async (req, res) => {
  const kind = kindOf(req.params.kind);
  const b = nameBody.extend({ amount: z.number().min(0, "መጠኑ ትክክል አይደለም።").optional() }).parse(req.body);
  if (kind === "categories" && b.amount === undefined) throw badRequest("የወርሃዊ ክፍያ መጠን ያስገቡ።");
  const id = await tx(async (c) => {
    const dup = await query(`select 1 from ${KINDS[kind].table} where lower(name)=lower($1)`, [b.name], c);
    if (dup.rowCount) throw conflict("ይህ ስም ቀድሞ አለ።");
    const r = await query(`insert into ${KINDS[kind].table} (name, sort_order) values ($1, coalesce((select max(sort_order)+1 from ${KINDS[kind].table}), 1)) returning id`, [b.name], c);
    if (kind === "categories") {
      const { systemStartYear } = await getSettings(c);
      await query(`insert into payment_rules (category_id, amount, effective_year, effective_month, created_by) values ($1,$2,$3,1,$4)`, [r.rows[0].id, b.amount, systemStartYear, req.user!.id], c);
    }
    await audit(c, req.user!, "LOOKUP_CREATED", kind, r.rows[0].id, { name: b.name, amount: b.amount });
    return r.rows[0].id as number;
  });
  res.status(201).json({ id, message: "በተሳካ ሁኔታ ተጨምሯል።" });
}));

configApi.put("/:kind/:id", adminOnly, wrap(async (req, res) => {
  const kind = kindOf(req.params.kind), id = idParam(req.params.id);
  const b = nameBody.parse(req.body);
  await tx(async (c) => {
    const dup = await query(`select 1 from ${KINDS[kind].table} where lower(name)=lower($1) and id<>$2`, [b.name, id], c);
    if (dup.rowCount) throw conflict("ይህ ስም ቀድሞ አለ።");
    const r = await query(`update ${KINDS[kind].table} set name=$1, is_active=coalesce($2,is_active), sort_order=coalesce($3,sort_order) where id=$4`, [b.name, b.isActive ?? null, b.sortOrder ?? null, id], c);
    if (!r.rowCount) throw notFound();
    await audit(c, req.user!, "LOOKUP_UPDATED", kind, id, { name: b.name, isActive: b.isActive });
  });
  res.json({ message: "በተሳካ ሁኔታ ተሻሽሏል።" });
}));

configApi.delete("/:kind/:id", adminOnly, wrap(async (req, res) => {
  const kind = kindOf(req.params.kind), id = idParam(req.params.id);
  const k = KINDS[kind];
  const used = (await query(`select count(*)::int n from members where ${k.fk}=$1`, [id])).rows[0].n
    + (kind === "categories" ? (await query("select count(*)::int n from payment_obligations where category_id=$1", [id])).rows[0].n : 0);
  if (used > 0) throw conflict("ይህ በአገልግሎት ላይ ስላለ ሊሰረዝ አይችልም። በምትኩ «አሰናክል» ን ይጠቀሙ።");
  await tx(async (c) => {
    if (kind === "categories") await query("delete from payment_rules where category_id=$1", [id], c);
    const r = await query(`delete from ${k.table} where id=$1`, [id], c);
    if (!r.rowCount) throw notFound();
    await audit(c, req.user!, "LOOKUP_DELETED", kind, id);
  });
  res.json({ message: "በተሳካ ሁኔታ ተሰርዟል።" });
}));

// ───────── prices (የክፍያ ቅንብር) ─────────
configApi.get("/categories/:id/prices", staffOnly, wrap(async (req, res) => {
  const { rows } = await query(
    `select r.id, r.amount, r.effective_year, r.effective_month, r.created_at, u.full_name as created_by
       from payment_rules r left join users u on u.id=r.created_by where r.category_id=$1
      order by r.effective_year desc, r.effective_month desc, r.id desc`, [idParam(req.params.id)]);
  res.json({ rows });
}));

const priceBody = z.object({
  amount: z.number().min(0, "መጠኑ ትክክል አይደለም።").max(1_000_000),
  effectiveYear: z.number().int(), effectiveMonth: z.number().int().min(1).max(13),
});
configApi.post("/categories/:id/price", adminOnly, wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = priceBody.parse(req.body);
  const cur = currentPeriod();
  if (comparePeriods({ year: b.effectiveYear, month: b.effectiveMonth }, cur) < 0)
    throw badRequest("አዲሱ መጠን የሚጀምርበት ወር ከአሁኑ ወር በፊት መሆን አይችልም። (ያለፉ ክፍያዎች አይቀየሩም)");
  const updated = await tx(async (c) => {
    const cat = (await query("select name from payment_categories where id=$1", [id], c)).rows[0];
    if (!cat) throw notFound();
    const before = await applicableAmount(c, id, b.effectiveYear, b.effectiveMonth);
    await query(`insert into payment_rules (category_id, amount, effective_year, effective_month, created_by) values ($1,$2,$3,$4,$5)`, [id, b.amount, b.effectiveYear, b.effectiveMonth, req.user!.id], c);
    // only still-open obligations from the effective month onward are re-priced; paid/pending/past ones are frozen
    const n = await repriceOpenObligations(c, { categoryId: id, fromOrd: b.effectiveYear * MONTHS_IN_YEAR + b.effectiveMonth });
    await generateObligations(c);
    await audit(c, req.user!, "PRICE_CHANGED", "category", id, { name: cat.name, from: before, to: b.amount, effective: `${b.effectiveYear}/${b.effectiveMonth}`, repriced: n });
    return n;
  });
  res.json({ message: "የክፍያ መጠኑ ተሻሽሏል።", repriced: updated });
}));

// ───────── organization settings ─────────
configApi.get("/settings", staffOnly, wrap(async (_req, res) => res.json(await getSettings())));

const settingsBody = z.object({
  orgName: z.string().trim().min(2, "የድርጅቱን ስም ያስገቡ።").max(150),
  orgPhone: z.string().trim().max(60).default(""), orgEmail: z.string().trim().max(120).default(""),
  orgAddress: z.string().trim().max(250).default(""), orgDescription: z.string().trim().max(500).default(""), orgParent: z.string().trim().max(150).optional(),
  billPagumen: z.boolean(),
});
configApi.put("/settings", adminOnly, wrap(async (req, res) => {
  const b = settingsBody.parse(req.body);
  if (b.orgEmail && !/^\S+@\S+\.\S+$/.test(b.orgEmail)) throw badRequest("ኢሜይሉ ትክክል አይደለም።");
  await tx(async (c) => {
    const old = await getSettings(c);
    const uid = req.user!.id;
    await setSetting(c, "org_name", b.orgName, uid); await setSetting(c, "org_phone", b.orgPhone, uid);
    await setSetting(c, "org_email", b.orgEmail, uid); await setSetting(c, "org_address", b.orgAddress, uid);
    await setSetting(c, "org_description", b.orgDescription, uid); if (b.orgParent !== undefined) await setSetting(c, "org_parent", b.orgParent, uid); await setSetting(c, "bill_pagumen", b.billPagumen, uid);
    if (old.billPagumen !== b.billPagumen) {
      await ensureCurrentPeriods(c);
      await query("update payment_periods set is_billable=$1 where ethiopian_month=13", [b.billPagumen], c);
      if (b.billPagumen) await generateObligations(c);
    }
    await audit(c, req.user!, "SETTINGS_CHANGED", "settings", "org", { before: old, after: b });
  });
  res.json({ message: "የድርጅቱ መረጃ ተሻሽሏል።" });
}));

configApi.post("/settings/logo", adminOnly, upload().single("logo"), wrap(async (req, res) => {
  const f = req.file;
  if (!f) throw badRequest("አርማ አልተጫነም።");
  if (f.size > 2 * 1024 * 1024) throw badRequest("አርማው ከ2 ሜጋባይት መብለጥ የለበትም።");
  const t = detectFileType(f.buffer);
  if (!t || !["image/png", "image/jpeg"].includes(t.mime)) throw badRequest("አርማ PNG ወይም JPG መሆን አለበት።");
  const key = `branding/logo-${Date.now()}.${t.ext}`;
  await storage().put(key, f.buffer);
  const old = await getSettings();
  await tx(async (c) => {
    await setSetting(c, "logo_key", key, req.user!.id);
    await setSetting(c, "logo_mime", t.mime, req.user!.id);
    await audit(c, req.user!, "LOGO_CHANGED", "settings", "logo");
  });
  if (old.logoKey) await storage().delete(old.logoKey);
  res.json({ message: "አርማው ተቀይሯል።" });
}));

// ───────── finance administrators (admin only) ─────────
export const staffApi = Router();

staffApi.get("/", adminOnly, wrap(async (_req, res) => {
  const { rows } = await query(
    `select u.id, u.full_name, u.phone, u.is_active, u.last_login_at, u.must_change_password, u.created_at
       from users u join roles r on r.id=u.role_id where r.code='FINANCE' order by u.full_name`);
  res.json({ rows });
}));

const staffBody = z.object({ fullName: z.string().trim().min(3, "ሙሉ ስም ያስገቡ።").max(120), phone: z.string().trim().min(1, "ስልክ ቁጥር ያስገቡ።") });
staffApi.post("/", adminOnly, wrap(async (req, res) => {
  const b = staffBody.parse(req.body);
  const phone = normalizePhone(b.phone);
  if (!phone) throw badRequest("ስልክ ቁጥሩ ትክክል አይደለም። ምሳሌ፦ 0911223344");
  const pw = generatePassword(); const hash = await hashPassword(pw);
  const id = await tx(async (c) => {
    if ((await query("select 1 from users where phone=$1", [phone], c)).rowCount) throw conflict("ይህ ስልክ ቁጥር ቀድሞ ተመዝግቧል።");
    const r = await query(`insert into users (role_id, phone, full_name, password_hash, must_change_password, created_by)
      values ((select id from roles where code='FINANCE'), $1,$2,$3,true,$4) returning id`, [phone, b.fullName, hash, req.user!.id], c);
    await audit(c, req.user!, "STAFF_CREATED", "user", r.rows[0].id, { name: b.fullName });
    return r.rows[0].id as string;
  });
  res.status(201).json({ id, phone, fullName: b.fullName, initialPassword: pw, message: "የገንዘብ ያዡ መለያ ተፈጥሯል።" });
}));

const financeUser = async (id: string) => {
  const u = (await query(`select u.id from users u join roles r on r.id=u.role_id where u.id=$1 and r.code='FINANCE'`, [id])).rows[0];
  if (!u) throw notFound();
};
staffApi.put("/:id", adminOnly, wrap(async (req, res) => {
  const id = String(req.params.id); await financeUser(id);
  const b = staffBody.extend({ isActive: z.boolean() }).parse(req.body);
  const phone = normalizePhone(b.phone);
  if (!phone) throw badRequest("ስልክ ቁጥሩ ትክክል አይደለም።");
  await tx(async (c) => {
    if ((await query("select 1 from users where phone=$1 and id<>$2", [phone, id], c)).rowCount) throw conflict("ይህ ስልክ ቁጥር ቀድሞ ተመዝግቧል።");
    await query(`update users set full_name=$1, phone=$2, is_active=$3, token_version = token_version + case when $3 then 0 else 1 end, updated_at=now() where id=$4`, [b.fullName, phone, b.isActive, id], c);
    await audit(c, req.user!, "STAFF_UPDATED", "user", id, { name: b.fullName, isActive: b.isActive });
  });
  res.json({ message: "መረጃው ተሻሽሏል።" });
}));
staffApi.post("/:id/reset-password", adminOnly, wrap(async (req, res) => {
  const id = String(req.params.id); await financeUser(id);
  if (id === req.user!.id) throw forbidden();
  res.json({ initialPassword: await resetUserPassword(id, req.user!, { type: "user", id }), message: "አዲስ የመጀመሪያ የይለፍ ቃል ተፈጥሯል።" });
}));

// ───────── audit log (admin only) ─────────
export const auditApi = Router();
auditApi.get("/", adminOnly, wrap(async (req, res) => {
  const page = intOrUndef(req.query.page) ?? 1, size = 30;
  const params: unknown[] = []; let w = " where true";
  if (typeof req.query.action === "string" && req.query.action) { params.push(req.query.action); w += ` and a.action = $${params.length}`; }
  if (typeof req.query.search === "string" && req.query.search.trim()) { params.push(`%${req.query.search.trim()}%`); w += ` and (a.user_name ilike $${params.length} or a.details::text ilike $${params.length})`; }
  const total = (await query(`select count(*)::int n from audit_logs a ${w}`, params)).rows[0].n;
  const { rows } = await query(`select a.id, a.user_name, a.action, a.entity_type, a.entity_id, a.details, a.created_at from audit_logs a ${w} order by a.id desc limit ${size} offset ${(page - 1) * size}`, params);
  res.json({ total, page, pageSize: size, rows });
}));
void ord;
