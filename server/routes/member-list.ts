import { Router } from "express";
import { getPool } from "../db";
import { audit } from "../lib/audit";
import { staffOnly } from "../lib/auth";
import { displayPhone } from "../lib/phone";
import { badRequest } from "../lib/errors";
import { generateMissing, listCredentials, revealInitialPassword } from "../services/credentials";
import { render, TableSpec } from "../services/exports";
import { query } from "../db";
import { idParam, parseFilters, sendFile, wrap } from "./util";

export const memberListApi = Router();
memberListApi.use(staffOnly);

const parse = (q: any) => {
  const f = parseFilters(q);
  return { search: f.search, departmentId: f.departmentId, categoryId: f.categoryId, credStatus: q.credStatus === "pending" || q.credStatus === "changed" ? (q.credStatus as "pending" | "changed") : undefined, page: f.page, pageSize: f.pageSize };
};

memberListApi.get("/", wrap(async (req, res) => res.json(await listCredentials(parse(req.query)))));

const COLS: Record<string, { header: string; key: string; width: number; align?: "center" }> = {
  code: { header: "የአባል መለያ", key: "code", width: 12 },
  name: { header: "የአባል ስም", key: "name", width: 28 },
  phone: { header: "ስልክ ቁጥር (መግቢያ)", key: "phone", width: 16 },
  dept: { header: "የአገልግሎት ክፍል", key: "dept", width: 26 },
  type: { header: "የአባል አይነት", key: "type", width: 13 },
  status: { header: "የመግቢያ ሁኔታ", key: "status", width: 20 },
  password: { header: "የመጀመሪያ ይለፍ ቃል", key: "password", width: 18 },
};
const ORDER = ["code", "name", "phone", "dept", "type", "status", "password"];

async function nameOf(table: string, id?: number) { return id ? (await query(`select name from ${table} where id = $1`, [id])).rows[0]?.name : undefined; }

memberListApi.get("/export", wrap(async (req, res) => {
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const f = parse(req.query);
  const wanted = String(req.query.cols ?? "name,dept,type,password").split(",");
  const keys = ORDER.filter((k) => k === "name" || wanted.includes(k));
  const withPassword = keys.includes("password");
  const d = await listCredentials(f, { paginate: false, withPasswords: withPassword });

  const parts: string[] = [];
  const dept = await nameOf("service_departments", f.departmentId); if (dept) parts.push(`የአገልግሎት ክፍል፦ ${dept}`);
  const cat = await nameOf("payment_categories", f.categoryId); if (cat) parts.push(`የአባል አይነት፦ ${cat}`);
  if (f.credStatus) parts.push(`የመግቢያ ሁኔታ፦ ${f.credStatus === "pending" ? "ይለፍ ቃል አልተቀየረም" : "ይለፍ ቃል ተቀይሯል"}`);
  if (f.search) parts.push(`ፍለጋ፦ ${f.search}`);

  const passwordCell = (r: any) => (!r.must_change_password ? "የይለፍ ቃል ተቀይሯል" : r.initial_password ?? "አልተቀመጠም");
  const spec: TableSpec = {
    title: withPassword ? "የአባላት የመጀመሪያ መግቢያ መረጃ" : "የአባላት ዝርዝር",
    fileBase: withPassword ? "የመጀመሪያ-መግቢያ-መረጃ" : "የአባላት-ዝርዝር",
    filterLines: [parts.length ? parts.join("  •  ") : "ሁሉም አባላት (ምንም ማጣሪያ አልተመረጠም)", `ጠቅላላ አባላት፦ ${d.total}`],
    landscape: keys.length > 4,
    columns: [{ header: "ተ.ቁ", key: "no", width: 6, align: "center" }, ...keys.map((k) => COLS[k])],
    rows: d.rows.map((r: any, i: number) => ({
      no: i + 1, code: r.member_code, name: r.full_name, phone: displayPhone(r.phone), dept: r.department, type: r.category,
      status: r.must_change_password ? "ይለፍ ቃል አልተቀየረም" : "ይለፍ ቃል ተቀይሯል", password: passwordCell(r),
    })),
    notes: withPassword ? [
      "ማስታወሻ፦ ይህ የመጀመሪያ ጊዜ መግቢያ ይለፍ ቃል ነው። አባሉ በመጀመሪያ ጊዜ ከገባ በኋላ ወዲያውኑ የይለፍ ቃሉን መቀየር አለበት። የይለፍ ቃልዎን ለሌላ ሰው አያጋሩ።",
      "እባክዎ ከመጀመሪያ መግቢያ በኋላ ይለፍ ቃልዎን ይቀይሩ።",
      "መግቢያ፦ በስልክ ቁጥርዎና በዚህ የመጀመሪያ ይለፍ ቃል ይግቡ።",
    ] : undefined,
  };
  if (withPassword) await audit(getPool(), req.user!, "CREDENTIAL_EXPORTED", "member-list", undefined, { count: d.total, format });
  const out = await render(spec, format);
  sendFile(res, out.buffer, out.mime, out.filename);
}));

memberListApi.post("/generate-missing", wrap(async (req, res) => {
  const r = await generateMissing(req.user!);
  res.json({ ...r, message: r.remaining ? "ቀጣዩ ቡድን እየተፈጠረ ነው…" : "የጎደሉት የመጀመሪያ ይለፍ ቃሎች ተፈጥረዋል።" });
}));

memberListApi.get("/:id/initial-password", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) throw badRequest();
  res.setHeader("Cache-Control", "no-store");
  res.json({ password: await revealInitialPassword(id, req.user!) });
}));