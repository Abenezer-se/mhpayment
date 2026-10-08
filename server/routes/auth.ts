import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../db";
import { audit } from "../lib/audit";
import {
  clearSessionCookie, DUMMY_HASH, hashPassword, requireAuth, setSessionCookie, signSession, verifyPassword,
} from "../lib/auth";
import { badRequest, unauthorized, AppError } from "../lib/errors";
import { normalizePhone } from "../lib/phone";
import { storage } from "../lib/storage";
import { getSettings } from "../services/settings";
import { wrap } from "./util";
import { currentPeriod } from "../../shared/calendar/payment-period";
import { nowEthiopian } from "../../shared/calendar/ethiopian";

export const auth = Router();
export const publicApi = Router();

const MAX_ATTEMPTS = 5, LOCK_MINUTES = 15;
const PORTAL_ROLE = { member: "MEMBER", admin: "ADMIN", finance: "FINANCE" } as const;

const loginBody = z.object({
  phone: z.string().min(1, "ስልክ ቁጥር ያስገቡ።"), password: z.string().min(1, "የይለፍ ቃል ያስገቡ።"),
  portal: z.enum(["member", "admin", "finance"]),
});

auth.post("/login", wrap(async (req, res) => {
  const b = loginBody.parse(req.body);
  const phone = normalizePhone(b.phone);
  const bad = unauthorized("ስልክ ቁጥሩ ወይም የይለፍ ቃሉ ትክክል አይደለም።");
  if (!phone) { await verifyPassword(b.password, DUMMY_HASH); throw bad; }
  const u = (await query(
    `select u.id, u.password_hash, u.is_active, u.token_version, u.failed_attempts, u.locked_until, r.code as role
       from users u join roles r on r.id=u.role_id where u.phone=$1`, [phone])).rows[0];
  if (!u) { await verifyPassword(b.password, DUMMY_HASH); throw bad; }
  if (u.locked_until && new Date(u.locked_until) > new Date())
    throw new AppError(429, `ብዙ ጊዜ ተሳስተዋል። ከ${LOCK_MINUTES} ደቂቃ በኋላ ደግመው ይሞክሩ።`, "LOCKED");
  if (!(await verifyPassword(b.password, u.password_hash))) {
    const attempts = u.failed_attempts + 1;
    await query(`update users set failed_attempts=$2::int, locked_until = case when $2::int >= $3::int then now() + ($4 || ' minutes')::interval else null end where id=$1`,
      [u.id, attempts, MAX_ATTEMPTS, String(LOCK_MINUTES)]);
    throw bad;
  }
  if (u.role !== PORTAL_ROLE[b.portal]) {
    const where = u.role === "ADMIN" ? "/admin" : u.role === "FINANCE" ? "/finance" : "/";
    throw new AppError(403, `ይህ መግቢያ ለእርስዎ አይደለም። እባክዎ በ${where === "/" ? "ዋናው ገጽ" : where} ይግቡ።`, "WRONG_PORTAL");
  }
  if (!u.is_active) throw new AppError(403, "መለያዎ ታግዷል። እባክዎ የገንዘብ ያዡን ያነጋግሩ።", "DISABLED");
  await query("update users set failed_attempts=0, locked_until=null, last_login_at=now() where id=$1", [u.id]);
  setSessionCookie(res, await signSession(u.id, u.token_version));
  res.json({ ok: true, role: u.role });
}));

auth.post("/logout", (_req, res) => { clearSessionCookie(res); res.json({ ok: true }); });

auth.get("/me", wrap(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user });
}));

const pwBody = z.object({
  currentPassword: z.string().min(1, "አሁን ያለውን የይለፍ ቃል ያስገቡ።"),
  newPassword: z.string().min(8, "አዲሱ የይለፍ ቃል ቢያንስ 8 ፊደላት መሆን አለበት።").max(100),
});
auth.post("/change-password", requireAuth, wrap(async (req, res) => {
  const b = pwBody.parse(req.body);
  const u = (await query("select password_hash from users where id=$1", [req.user!.id])).rows[0];
  if (!(await verifyPassword(b.currentPassword, u.password_hash))) throw badRequest("አሁን ያለው የይለፍ ቃል ትክክል አይደለም።");
  if (b.currentPassword === b.newPassword) throw badRequest("አዲሱ የይለፍ ቃል ከድሮው የተለየ መሆን አለበት።");
  const hash = await hashPassword(b.newPassword);
  const tv = await tx(async (c) => {
    const r = await query("update users set password_hash=$1, must_change_password=false, initial_password_enc=null, initial_password_at=null, token_version=token_version+1, updated_at=now() where id=$2 returning token_version", [hash, req.user!.id], c);
    await audit(c, req.user!, "PASSWORD_CHANGED", "user", req.user!.id);
    return r.rows[0].token_version as number;
  });
  setSessionCookie(res, await signSession(req.user!.id, tv)); // other sessions are now invalid
  res.json({ ok: true, message: "የይለፍ ቃልዎ በተሳካ ሁኔታ ተቀይሯል።" });
}));

/**
 * Password recovery: SMS/e-mail are not available in this version, so recovery is done by the finance administrator
 * (POST /api/members/:id/reset-password) who gives a new one-time password. When an SMS gateway is added later, implement
 * a `PasswordResetNotifier` and a self-service endpoint here.
 */

// ───────── public (no login needed): branding for the login pages ─────────
publicApi.get("/meta", wrap(async (_req, res) => {
  const s = await getSettings();
  res.setHeader("Cache-Control", "no-store");
  res.json({
    orgName: s.orgName, orgPhone: s.orgPhone, orgEmail: s.orgEmail, orgAddress: s.orgAddress,
    hasLogo: !!s.logoKey, logoVersion: s.logoKey, startYear: s.systemStartYear, billPagumen: s.billPagumen,
    today: nowEthiopian(), currentPeriod: currentPeriod(),
  });
}));

publicApi.get("/logo", wrap(async (_req, res) => {
  const s = await getSettings();
  if (!s.logoKey || !s.logoMime) return res.status(404).end();
  const buf = await storage().get(s.logoKey);
  if (!buf) return res.status(404).end();
  res.setHeader("Content-Type", s.logoMime);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(buf);
}));
