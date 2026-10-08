import { Router } from "express";
import { query } from "../db";
import { staffOnly } from "../lib/auth";
import { displayPhone } from "../lib/phone";
import { notFound } from "../lib/errors";
import { createMember, getMember, listMembers, memberInput, resetUserPassword, setMemberActive, updateMember } from "../services/members";
import { render, TableSpec } from "../services/exports";
import { formatInstant } from "../../shared/calendar/ethiopian";
import { idParam, intOrUndef, parseFilters, sendFile, wrap } from "./util";

export const membersApi = Router();
membersApi.use(staffOnly);

/** Obligations of one member for an Ethiopian year, with the info a payer needs to see (also used by the member's own page). */
export async function memberObligations(memberId: number, year: number) {
  const { rows } = await query(
    `select o.id, o.ethiopian_year, o.ethiopian_month, o.amount, o.status,
            t.id as transaction_id, t.reference_no, t.method, t.paid_at, t.status as tx_status,
            (select rt.reject_reason from payment_transaction_items ri join payment_transactions rt on rt.id = ri.transaction_id
              where ri.obligation_id = o.id and rt.status = 'REJECTED' order by rt.id desc limit 1) as reject_reason
       from payment_obligations o
       left join payment_transaction_items ti on ti.obligation_id = o.id and ti.is_active
       left join payment_transactions t on t.id = ti.transaction_id
      where o.member_id = $1 and o.ethiopian_year = $2 order by o.ethiopian_month`, [memberId, year]);
  return rows;
}

membersApi.get("/", wrap(async (req, res) => {
  const f = parseFilters(req.query);
  res.json(await listMembers({
    search: f.search, departmentId: f.departmentId, memberTypeId: f.memberTypeId, categoryId: f.categoryId,
    active: f.active === "1" || f.active === "0" ? f.active : undefined, status: f.status, page: f.page, pageSize: f.pageSize,
  }));
}));

membersApi.get("/export", wrap(async (req, res) => {
  const f = parseFilters(req.query);
  const { rows } = await listMembers({
    search: f.search, departmentId: f.departmentId, memberTypeId: f.memberTypeId, categoryId: f.categoryId,
    active: f.active === "1" || f.active === "0" ? f.active : undefined, status: f.status,
  }, false);
  const format = req.query.format === "pdf" ? "pdf" : "xlsx";
  const spec: TableSpec = {
    title: "የተመዘገቡ አባላት ዝርዝር", fileBase: "የተመዘገቡ-አባላት", landscape: false,
    filterLines: [`ጠቅላላ አባላት፦ ${rows.length}`],
    columns: [
      { header: "ተ.ቁ", key: "no", width: 6 }, { header: "የአባል መለያ", key: "code", width: 14 }, { header: "ሙሉ ስም", key: "name", width: 30 },
      { header: "ስልክ ቁጥር", key: "phone", width: 15 }, { header: "የአባልነት አይነት", key: "type", width: 18 },
      { header: "የክፍያ ምድብ", key: "cat", width: 14 }, { header: "ክፍል", key: "dept", width: 26 },
    ],
    rows: rows.map((r, i) => ({ no: i + 1, code: r.member_code, name: r.full_name, phone: displayPhone(r.phone), type: r.member_type, cat: r.category, dept: r.department })),
  };
  const out = await render(spec, format);
  sendFile(res, out.buffer, out.mime, out.filename);
}));

membersApi.post("/", wrap(async (req, res) => {
  const input = memberInput.parse(req.body);
  const m = await createMember(input, req.user!);
  res.status(201).json({ ...m, phoneDisplay: displayPhone(m.phone), message: "አባሉ በተሳካ ሁኔታ ተመዝግቧል።" });
}));

membersApi.get("/:id", wrap(async (req, res) => {
  const m = await getMember(idParam(req.params.id));
  res.json({ ...m, phone_display: displayPhone(m.phone) });
}));

membersApi.put("/:id", wrap(async (req, res) => {
  await updateMember(idParam(req.params.id), memberInput.parse(req.body), req.user!);
  res.json({ message: "የአባሉ መረጃ ተሻሽሏል።" });
}));

membersApi.post("/:id/deactivate", wrap(async (req, res) => { await setMemberActive(idParam(req.params.id), false, req.user!); res.json({ message: "አባሉ ታግዷል።" }); }));
membersApi.post("/:id/activate", wrap(async (req, res) => { await setMemberActive(idParam(req.params.id), true, req.user!); res.json({ message: "አባሉ ተመልሷል።" }); }));

membersApi.post("/:id/reset-password", wrap(async (req, res) => {
  const m = await getMember(idParam(req.params.id));
  const pw = await resetUserPassword(m.user_id, req.user!, { type: "member", id: m.id });
  res.json({ initialPassword: pw, phone: displayPhone(m.phone), fullName: m.full_name, message: "አዲስ የመጀመሪያ የይለፍ ቃል ተፈጥሯል።" });
}));

membersApi.get("/:id/obligations", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const year = intOrUndef(req.query.year);
  if (!year) throw notFound();
  res.json({ rows: await memberObligations(id, year) });
}));
void formatInstant;
