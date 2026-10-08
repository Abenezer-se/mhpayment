import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer from "multer";
import { env } from "../config";
import { badRequest } from "../lib/errors";
import type { EtDate } from "../../shared/calendar/ethiopian";
import type { MatrixFilters } from "../services/reports";

export const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export const upload = () => multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadBytes, files: 1 } });

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" && v !== "all" && v !== "ALL" ? v.trim() : undefined);
export const intOrUndef = (v: unknown) => { const s = str(v); if (!s) return undefined; const n = Number(s); return Number.isInteger(n) ? n : undefined; };
export function idParam(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest();
  return n;
}
const etDate = (v: unknown): EtDate | undefined => {
  const s = str(v); if (!s) return undefined;
  const [year, month, day] = s.split("-").map(Number);
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) ? { year, month, day } : undefined;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => { const s = str(v); return s && (list as readonly string[]).includes(s) ? (s as T) : undefined; };

export function parseFilters(q: Request["query"]): MatrixFilters {
  return {
    year: intOrUndef(q.year), month: intOrUndef(q.month),
    departmentId: intOrUndef(q.departmentId), categoryId: intOrUndef(q.categoryId), memberTypeId: intOrUndef(q.memberTypeId),
    status: oneOf(q.status, ["UNPAID", "PENDING", "PAID", "REJECTED"] as const),
    method: oneOf(q.method, ["CASH", "MOBILE_BANKING"] as const),
    search: str(q.search),
    dateFrom: etDate(q.dateFrom), dateTo: etDate(q.dateTo),
    dateBasis: oneOf(q.dateBasis, ["paid", "period"] as const),
    active: oneOf(q.active, ["1", "0", "all"] as const),
    page: intOrUndef(q.page), pageSize: intOrUndef(q.pageSize),
  };
}

export function sendFile(res: Response, buf: Buffer, mime: string, filename: string, inline = false) {
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", String(buf.length));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="download${filename.slice(filename.lastIndexOf("."))}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.end(buf);
}
