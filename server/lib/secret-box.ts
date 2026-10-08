/**
 * Reversible encryption ONLY for temporary (initial) passwords, so they can be printed on the credential sheet.
 * AES-256-GCM; the key is derived from AUTH_SECRET, so a copy of the database alone does not reveal them.
 * The stored value is erased as soon as the member sets a personal password.
 */
import crypto from "node:crypto";
import { env } from "../config";

const key = () => Buffer.from(crypto.hkdfSync("sha256", Buffer.from(env.authSecret), "mhpayment-salt", "initial-password-v1", 32));

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Returns null if the value is missing, damaged, or AUTH_SECRET has changed since it was stored. */
export function decryptSecret(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const [v, iv, tag, data] = token.split(".");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}