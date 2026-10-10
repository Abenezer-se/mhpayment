/**
 * File storage for payment screenshots and the logo.
 * Files NEVER go into PostgreSQL — the DB only keeps the key + metadata.
 *   - netlify driver : Netlify Blobs (zero configuration on Netlify)
 *   - local driver   : disk, for development
 * To move to S3/R2 later, implement the same 3 methods.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config";
import { AppError } from "./errors";

export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements FileStorage {
  private file(key: string) {
    const root = path.resolve(process.cwd(), env.localUploadDir);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }
  async put(key: string, data: Buffer) { const f = this.file(key); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, data); }
  async get(key: string) { try { return await fs.readFile(this.file(key)); } catch { return null; } }
  async delete(key: string) { try { await fs.unlink(this.file(key)); } catch { /* ignore */ } }
}

class NetlifyBlobStorage implements FileStorage {
  private async store() {
    const { getStore } = await import("@netlify/blobs");
    // Default consistency on purpose: Netlify's function mode gives no 'uncachedEdgeURL', so "strong" made EVERY save/read fail.
    return getStore("uploads");
  }
  async put(key: string, data: Buffer) {
    try { await (await this.store()).set(key, new Uint8Array(data).buffer as ArrayBuffer); }
    catch (e) { console.error("Netlify Blobs put failed:", e); throw new AppError(500, "ፋይሉን በማከማቻ ውስጥ ማስቀመጥ አልተቻለም። እባክዎ ደግመው ይሞክሩ፤ ካልተሳካ አስተዳዳሪውን ያነጋግሩ።", "STORAGE"); }
  }
  async get(key: string) {
    const ab = await (await this.store()).get(key, { type: "arrayBuffer" });
    return ab ? Buffer.from(ab) : null;
  }
  async delete(key: string) { await (await this.store()).delete(key); }
}

let instance: FileStorage | undefined;
export function storage(): FileStorage {
  return (instance ??= env.storageDriver === "netlify" ? new NetlifyBlobStorage() : new LocalStorage());
}

// ───────── upload validation: judge by file CONTENT (magic bytes), never by name or client MIME ─────────
export interface DetectedFile { mime: string; ext: string; isImage: boolean }

export function detectFileType(b: Buffer): DetectedFile | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg", isImage: true };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png", isImage: true };
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", ext: "webp", isImage: true };
  if (b.subarray(0, 5).toString("ascii") === "%PDF-") return { mime: "application/pdf", ext: "pdf", isImage: false };
  return null;
}
