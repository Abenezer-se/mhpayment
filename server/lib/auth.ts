import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config";
import { query } from "../db";
import { forbidden, unauthorized } from "./errors";

export type Role = "ADMIN" | "FINANCE" | "MEMBER";
export interface SessionUser {
  id: string; role: Role; phone: string; fullName: string; mustChangePassword: boolean;
  memberId: number | null; memberCode: string | null;
}
declare module "express-serve-static-core" { interface Request { user?: SessionUser } }

export const COOKIE = "mh_session";
const BCRYPT_ROUNDS = 10;

export const hashPassword = (p: string) => bcrypt.hash(p, BCRYPT_ROUNDS);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);
// compared against when the phone does not exist, to keep response time uniform
export const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_ROUNDS);

/** Unambiguous characters only (no 0/O, 1/l/I) so it can be read out over the phone. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function generatePassword(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

export async function signSession(userId: string, tokenVersion: number): Promise<string> {
  return new SignJWT({ tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${env.sessionHours}h`)
    .sign(env.authSecret);
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/", maxAge: env.sessionHours * 3600 * 1000,
  });
}
export const clearSessionCookie = (res: Response) => res.clearCookie(COOKIE, { path: "/" });

/** Loads the user from the DB on every request, so disabling an account / changing a password takes effect immediately. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return next();
    const { payload } = await jwtVerify(token, env.authSecret, { algorithms: ["HS256"] });
    const { rows } = await query(
      `select u.id, u.phone, u.full_name, u.must_change_password, u.is_active, u.token_version, r.code as role,
              m.id as member_id, m.member_code, m.is_active as member_active
         from users u join roles r on r.id = u.role_id
         left join members m on m.user_id = u.id
        where u.id = $1`, [payload.sub]);
    const u = rows[0];
    if (u && u.is_active && u.token_version === payload.tv && (u.role !== "MEMBER" || u.member_active)) {
      req.user = {
        id: u.id, role: u.role, phone: u.phone, fullName: u.full_name, mustChangePassword: u.must_change_password,
        memberId: u.member_id ?? null, memberCode: u.member_code ?? null,
      };
    }
  } catch { /* invalid/expired token → treated as logged out */ }
  next();
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  next();
};

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    // A user who still has the initial password may only change it.
    if (req.user.mustChangePassword) return next(forbidden("እባክዎ መጀመሪያ የይለፍ ቃልዎን ይቀይሩ።"));
    next();
  };
}
export const staffOnly = requireRole("ADMIN", "FINANCE");
export const adminOnly = requireRole("ADMIN");
export const memberOnly = requireRole("MEMBER");

/**
 * Basic CSRF defence (on top of SameSite=Lax cookies): state-changing requests must come from our own site.
 * Browsers label this with Sec-Fetch-Site; otherwise the Origin host must match one of the hosts this app is served on.
 */
export function sameOriginOnly(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const site = req.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return next();
  const origin = req.get("origin");
  if (!origin) return next(); // non-browser clients (curl, tests) carry no ambient cookies to abuse
  try {
    const hosts = new Set<string>();
    for (const h of [req.get("x-forwarded-host"), req.get("host")]) if (h) hosts.add(h.split(",")[0].trim());
    for (const u of [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL, process.env.APP_ORIGIN]) if (u) { try { hosts.add(new URL(u).host); } catch { /* ignore */ } }
    if (hosts.has(new URL(origin).host)) return next();
  } catch { /* fall through */ }
  next(forbidden());
}
