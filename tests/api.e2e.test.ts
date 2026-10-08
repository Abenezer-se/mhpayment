/**
 * End-to-end API test against a REAL PostgreSQL database.
 * Runs only when TEST_DATABASE_URL is set (it writes test members/payments, so use a scratch database):
 *   TEST_DATABASE_URL=postgresql://... npm test
 */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

const URL_ = process.env.TEST_DATABASE_URL;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

class Client {
  cookie = "";
  constructor(private base: string) {}
  async req(method: string, path: string, body?: any, form?: FormData) {
    const headers: Record<string, string> = { cookie: this.cookie };
    if (body) headers["content-type"] = "application/json";
    const r = await fetch(this.base + path, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    const ct = r.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, data: data as any, headers: r.headers };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b?: any) => this.req("POST", p, b ?? {});
  put = (p: string, b: any) => this.req("PUT", p, b);
}

describe.skipIf(!URL_)("API end-to-end (real PostgreSQL)", () => {
  let server: any, base = "";
  let admin: Client, finance: Client, member: Client, other: Client;
  let lookups: any, m1: any, m2: any;
  const suffix = String(Date.now()).slice(-6);

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_;
    process.env.AUTH_SECRET ||= "test-secret-test-secret-test-secret-123456";
    process.env.STORAGE_DRIVER = "local"; process.env.LOCAL_UPLOAD_DIR = ".data/test-uploads";
    const { createApp } = await import("../server/app");
    server = createApp().listen(0);
    base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
    admin = new Client(base); finance = new Client(base); member = new Client(base); other = new Client(base);
  });
  afterAll(async () => { server?.close(); const { getPool } = await import("../server/db"); await getPool().end(); });

  it("rejects anonymous access and the wrong portal", async () => {
    expect((await admin.get("/members")).status).toBe(401);
    const bad = await admin.post("/auth/login", { phone: "0911000001", password: "nope-nope", portal: "admin" });
    expect(bad.status).toBe(401);
    expect(bad.data.error.message).toContain("ትክክል አይደለም");
    const wrongPortal = await admin.post("/auth/login", { phone: "0911000001", password: "Admin#12345", portal: "finance" });
    expect(wrongPortal.status).toBe(403);
    expect((await admin.post("/auth/login", { phone: "+251 911 00 00 01", password: "Admin#12345", portal: "admin" })).status).toBe(200);
  });

  it("admin creates a finance administrator who must change the initial password", async () => {
    const c = await admin.post("/staff", { fullName: "ገንዘብ ያዥ ሙከራ", phone: `0922${suffix}` });
    expect(c.status).toBe(201);
    expect(c.data.initialPassword).toHaveLength(8);
    expect((await finance.post("/auth/login", { phone: `0922${suffix}`, password: c.data.initialPassword, portal: "finance" })).status).toBe(200);
    expect((await finance.get("/members")).status).toBe(403);               // blocked until password changed
    const ch = await finance.post("/auth/change-password", { currentPassword: c.data.initialPassword, newPassword: "Finance#2019" });
    expect(ch.status).toBe(200);
    expect((await finance.get("/members")).status).toBe(200);
    expect((await finance.post("/staff", { fullName: "xx xx xx", phone: "0933333333" })).status).toBe(403); // finance cannot create admins/staff
  });

  it("registers members, generates id/password/obligations; duplicate phones in any format are refused", async () => {
    lookups = (await finance.get("/config/lookups")).data;
    const student = lookups.categories.find((c: any) => c.name === "ተማሪ");
    const worker = lookups.categories.find((c: any) => c.name === "ሰራተኛ");
    expect(Number(student.amount)).toBe(15); expect(Number(worker.amount)).toBe(30);
    const body = (name: string, phone: string, cat: number) => ({ fullName: name, phone, memberTypeId: lookups.memberTypes[0].id, departmentId: lookups.departments[0].id, categoryId: cat });
    const r1 = await finance.post("/members", body("አቤነዘር ሳምሶን", `0933${suffix}`, student.id));
    expect(r1.status).toBe(201);
    expect(r1.data.memberCode).toMatch(/^MH\d{6}$/);
    expect(r1.data.initialPassword).toHaveLength(8);
    m1 = r1.data;
    const dup = await finance.post("/members", body("ሌላ ሰው ሌላ", `+251 933 ${suffix}`, student.id));
    expect(dup.status).toBe(409); expect(dup.data.error.message).toBe("ይህ ስልክ ቁጥር ቀድሞ ተመዝግቧል።");
    const dup2 = await finance.post("/members", body("ሌላ ሰው ሌላ", `251933${suffix}`, student.id));
    expect(dup2.status).toBe(409);
    const r2 = await finance.post("/members", body("ሳራ ተስፋዬ", `0944${suffix}`, worker.id));
    expect(r2.status).toBe(201); m2 = r2.data;

    const { currentPeriod } = await import("../shared/calendar/payment-period");
    const year = currentPeriod().year;
    const obl = (await finance.get(`/members/${m1.id}/obligations?year=${year}`)).data.rows;
    expect(obl.length).toBeGreaterThanOrEqual(12 - currentPeriod().month + 1);
    expect(obl.every((o: any) => o.status === "UNPAID" && Number(o.amount) === 15)).toBe(true);
    expect(new Set(obl.map((o: any) => o.ethiopian_month)).size).toBe(obl.length);
  });

  it("member: first login → forced password change → sees only own data", async () => {
    expect((await member.post("/auth/login", { phone: `0933${suffix}`, password: m1.initialPassword, portal: "member" })).status).toBe(200);
    expect((await member.get("/me/dashboard")).status).toBe(403);
    expect((await member.post("/auth/change-password", { currentPassword: m1.initialPassword, newPassword: "Member#2019x" })).status).toBe(200);
    const d = await member.get("/me/dashboard");
    expect(d.status).toBe(200);
    expect(d.data.info.member_code).toBe(m1.memberCode);
    expect(d.data.totals.paid).toBe(0);
    expect((await member.get("/members")).status).toBe(403);
    expect((await member.get(`/members/${m2.id}`)).status).toBe(403);
    expect((await other.post("/auth/login", { phone: `0944${suffix}`, password: m2.initialPassword, portal: "member" })).status).toBe(200);
    await other.post("/auth/change-password", { currentPassword: m2.initialPassword, newPassword: "Other#2019xx" });
  });

  let pendingTx: any, monthIds: number[];
  it("Method A: screenshot payment stays PENDING until approved; no double submission", async () => {
    const { currentPeriod } = await import("../shared/calendar/payment-period");
    const rows = (await member.get(`/me/obligations?year=${currentPeriod().year}`)).data.rows;
    monthIds = rows.slice(0, 4).map((r: any) => r.id);
    const noFile = new FormData(); noFile.set("obligationIds", JSON.stringify(monthIds.slice(0, 3)));
    expect((await member.req("POST", "/me/payments", undefined, noFile)).status).toBe(400);
    const evil = new FormData(); evil.set("obligationIds", JSON.stringify(monthIds.slice(0, 3)));
    evil.set("proof", new Blob([Buffer.from("MZ\x90\x00 not an image at all, exe")]), "x.png");
    expect((await member.req("POST", "/me/payments", undefined, evil)).status).toBe(400);

    const fd = new FormData(); fd.set("obligationIds", JSON.stringify(monthIds.slice(0, 3)));
    fd.set("proof", new Blob([PNG], { type: "image/png" }), "screenshot.png");
    const r = await member.req("POST", "/me/payments", undefined, fd);
    expect(r.status).toBe(201); expect(r.data.amount).toBe(45);
    pendingTx = r.data;
    const dash = (await member.get("/me/dashboard")).data;
    expect(dash.counts.pending).toBe(3);
    expect(dash.totals.paid).toBe(0);                                           // NOT paid before approval
    const fd2 = new FormData(); fd2.set("obligationIds", JSON.stringify([monthIds[0]]));
    fd2.set("proof", new Blob([PNG]), "again.png");
    const again = await member.req("POST", "/me/payments", undefined, fd2);
    expect(again.status).toBe(409);
  });

  it("another member cannot read the screenshot or the transaction", async () => {
    expect((await other.get(`/payments/${pendingTx.id}`)).status).toBe(404);
    expect((await other.get(`/payments/${pendingTx.id}/proof`)).status).toBe(404);
    const own = await member.get(`/payments/${pendingTx.id}/proof`);
    expect(own.status).toBe(200); expect(own.headers.get("content-type")).toBe("image/png");
    expect((await finance.get(`/payments/${pendingTx.id}/proof`)).status).toBe(200);
  });

  it("finance approves → months PAID, reference MH-PAY-xxxxxx, confirmation PDF; approving twice fails", async () => {
    expect((await finance.get("/payments?txStatus=PENDING")).data.rows.some((t: any) => t.id === pendingTx.id)).toBe(true);
    const ok = await finance.post(`/payments/${pendingTx.id}/approve`);
    expect(ok.status).toBe(200); expect(ok.data.message).toBe("ክፍያው ተረጋግጧል።");
    expect((await finance.post(`/payments/${pendingTx.id}/approve`)).status).toBe(409);
    const dash = (await member.get("/me/dashboard")).data;
    expect(dash.counts.paid).toBe(3); expect(dash.totals.paid).toBe(45);
    const tx = (await finance.get(`/payments/${pendingTx.id}`)).data;
    expect(tx.reference_no).toMatch(/^MH-PAY-\d{6}$/); expect(tx.status).toBe("VERIFIED");
    expect(tx.ethiopian_year).toBeGreaterThanOrEqual(2019); expect(tx.items).toHaveLength(3);
    const pdf = await member.get(`/payments/${pendingTx.id}/confirmation`);
    expect(pdf.status).toBe(200);
    expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.data.toString("latin1")).toContain("NotoSansEthiopic");           // Amharic font is embedded
  });

  it("Method B/C: staff records cash & mobile banking immediately; duplicate month refused (DB-safe)", async () => {
    const { currentPeriod } = await import("../shared/calendar/payment-period");
    const rows = (await finance.get(`/members/${m2.id}/obligations?year=${currentPeriod().year}`)).data.rows;
    const ids = rows.slice(0, 2).map((r: any) => r.id);
    const cash = await finance.req("POST", "/payments/record", undefined, (() => { const f = new FormData(); f.set("memberId", String(m2.id)); f.set("method", "CASH"); f.set("obligationIds", JSON.stringify(ids)); return f; })());
    expect(cash.status).toBe(201); expect(cash.data.amount).toBe(60);
    // two administrators clicking at the same time → exactly one wins
    const mk = () => { const f = new FormData(); f.set("memberId", String(m2.id)); f.set("method", "CASH"); f.set("obligationIds", JSON.stringify([rows[2].id])); return f; };
    const [a, b] = await Promise.all([finance.req("POST", "/payments/record", undefined, mk()), admin.req("POST", "/payments/record", undefined, mk())]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.data.error.message).toBe("ይህ ወር ቀድሞ ተከፍሏል።");
    const wrongAmount = new FormData(); wrongAmount.set("memberId", String(m2.id)); wrongAmount.set("method", "MOBILE_BANKING"); wrongAmount.set("amount", "1"); wrongAmount.set("obligationIds", JSON.stringify([rows[3].id]));
    expect((await finance.req("POST", "/payments/record", undefined, wrongAmount)).status).toBe(400);
    const mb = new FormData(); mb.set("memberId", String(m2.id)); mb.set("method", "MOBILE_BANKING"); mb.set("amount", "30"); mb.set("obligationIds", JSON.stringify([rows[3].id]));
    mb.set("proof", new Blob([PNG]), "p.png");
    expect((await finance.req("POST", "/payments/record", undefined, mb)).status).toBe(201);
  });

  it("rejection returns months to the member with the reason; member can resubmit", async () => {
    const rows = (await member.get(`/me/obligations?year=${(await import("../shared/calendar/payment-period")).currentPeriod().year}`)).data.rows;
    const target = rows.find((r: any) => r.status === "UNPAID");
    const fd = new FormData(); fd.set("obligationIds", JSON.stringify([target.id])); fd.set("proof", new Blob([PNG]), "s.png");
    const sub = await member.req("POST", "/me/payments", undefined, fd);
    expect((await finance.post(`/payments/${sub.data.id}/reject`, { reason: "" })).status).toBe(400);
    expect((await finance.post(`/payments/${sub.data.id}/reject`, { reason: "ምስሉ አይታይም" })).status).toBe(200);
    const d = (await member.get("/me/dashboard")).data;
    const row = d.rows.find((r: any) => r.id === target.id);
    expect(row.status).toBe("REJECTED"); expect(row.reject_reason).toBe("ምስሉ አይታይም");
    expect(d.rejected[0].reject_reason).toBe("ምስሉ አይታይም");
    const fd2 = new FormData(); fd2.set("obligationIds", JSON.stringify([target.id])); fd2.set("proof", new Blob([PNG]), "s2.png");
    expect((await member.req("POST", "/me/payments", undefined, fd2)).status).toBe(201);
  });

  it("price change keeps history: paid/pending/past months keep 15, later open months become 20", async () => {
    const { currentPeriod } = await import("../shared/calendar/payment-period");
    const cur = currentPeriod();
    const student = lookups.categories.find((c: any) => c.name === "ተማሪ");
    expect((await finance.post(`/config/categories/${student.id}/price`, { amount: 20, effectiveYear: cur.year, effectiveMonth: 6 })).status).toBe(403);
    expect((await admin.post(`/config/categories/${student.id}/price`, { amount: 20, effectiveYear: cur.year - 1, effectiveMonth: 1 })).status).toBe(400); // no back-dating
    const r = await admin.post(`/config/categories/${student.id}/price`, { amount: 20, effectiveYear: cur.year, effectiveMonth: 6 });
    expect(r.status).toBe(200);
    const rows = (await finance.get(`/members/${m1.id}/obligations?year=${cur.year}`)).data.rows;
    const byMonth = (n: number) => rows.find((x: any) => x.ethiopian_month === n);
    expect(Number(byMonth(1).amount)).toBe(15);                         // paid
    expect(Number(byMonth(5).amount)).toBe(15);                         // before effective month
    expect(Number(byMonth(6).amount)).toBe(20);                         // open & effective
    expect(Number(byMonth(12).amount)).toBe(20);
    await admin.post(`/config/categories/${student.id}/price`, { amount: 15, effectiveYear: cur.year, effectiveMonth: 6 }); // restore
  });

  it("reports: filters combine; summary totals come from verified transactions", async () => {
    const { currentPeriod } = await import("../shared/calendar/payment-period");
    const y = currentPeriod().year;
    const dept = lookups.departments[0].id;
    const s = (await finance.get(`/reports/summary?year=${y}&month=1&departmentId=${dept}&groupBy=none`)).data;
    expect(s.totals.members_paid).toBeGreaterThanOrEqual(2);
    expect(Number(s.totals.collected)).toBeGreaterThanOrEqual(45);
    const d = (await finance.get(`/reports/detail?year=${y}&departmentId=${dept}&status=PAID&method=CASH&search=${encodeURIComponent("ሳራ")}`)).data;
    expect(d.rows.length).toBeGreaterThan(0);
    expect(d.rows.every((r: any) => r.status === "PAID" && r.method === "CASH" && r.full_name.includes("ሳራ"))).toBe(true);
    const none = (await finance.get(`/reports/detail?year=${y}&status=PAID&method=CASH&search=${m1.memberCode}`)).data;
    expect(none.rows).toHaveLength(0);                                          // Abenezer paid by proof, not cash
    const byDate = (await finance.get(`/reports/detail?dateFrom=${y}-1-1&dateTo=${y}-13-6&dateBasis=paid&status=PAID`)).data;
    expect(byDate.total).toBeGreaterThan(0);
    const future = (await finance.get(`/reports/detail?dateFrom=${y + 5}-1-1&dateTo=${y + 5}-2-1&dateBasis=paid`)).data;
    expect(future.total).toBe(0);
    const mx = (await finance.get(`/reports/matrix?year=${y}&search=${m1.memberCode}`)).data;
    expect(mx.rows[0].months[0].status).toBe("PAID");
  });

  it("exports honour the filters: real .xlsx (Amharic headers) and .pdf (embedded font)", async () => {
    const { currentPeriod } = await import("../shared/calendar/payment-period");
    const y = currentPeriod().year;
    const x = await finance.get(`/reports/export?type=detail&format=xlsx&year=${y}&status=PAID&search=${encodeURIComponent("ሳራ")}`);
    expect(x.status).toBe(200); expect(x.headers.get("content-type")).toContain("spreadsheetml");
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.data);
    const ws = wb.worksheets[0];
    const headers = (ws.getRow(6).values as any[]).filter(Boolean);
    expect(headers).toContain("የአባል መለያ"); expect(headers).toContain("የክፍያ ዘዴ");
    const names = []; for (let r = 7; r <= ws.rowCount; r++) { const v = ws.getRow(r).getCell(2).value; if (v) names.push(String(v)); }
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => n.includes("ሳራ") || n === "")).toBe(true);        // ONLY the filtered rows (+ totals row has no name)
    for (const type of ["detail", "summary", "matrix"]) {
      const p = await finance.get(`/reports/export?type=${type}&format=pdf&year=${y}`);
      expect(p.status).toBe(200); expect(p.data.subarray(0, 5).toString()).toBe("%PDF-");
    }
    const ml = await finance.get(`/members/export?format=xlsx`); expect(ml.status).toBe(200);
    const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(ml.data);
    expect((wb2.worksheets[0].getRow(6).values as any[]).filter(Boolean)).toEqual(["ተ.ቁ", "የአባል መለያ", "ሙሉ ስም", "ስልክ ቁጥር", "የአባልነት አይነት", "የክፍያ ምድብ", "ክፍል"]);
    expect((await finance.get(`/members/export?format=pdf`)).status).toBe(200);
  });

  it("audit trail records the important actions; only admin can read it", async () => {
    expect((await finance.get("/audit")).status).toBe(403);
    const a = (await admin.get("/audit")).data;
    const actions = new Set(a.rows.map((r: any) => r.action));
    for (const x of ["MEMBER_REGISTERED", "PAYMENT_APPROVED", "PAYMENT_REJECTED", "PAYMENT_RECORDED", "PRICE_CHANGED", "STAFF_CREATED"]) expect(actions.has(x)).toBe(true);
  });

  it("admin voids a verified payment; months become unpaid again", async () => {
    const r = await finance.post(`/payments/${pendingTx.id}/void`, { reason: "ስህተት" });
    expect(r.status).toBe(403);
    expect((await admin.post(`/payments/${pendingTx.id}/void`, { reason: "በስህተት ተመዝግቧል" })).status).toBe(200);
    expect((await member.get("/me/dashboard")).data.counts.paid).toBe(0);
  });

  it("organization settings & logo are changeable (admin only)", async () => {
    expect((await finance.put("/config/settings", { orgName: "x", billPagumen: false })).status).toBe(403);
    const cur = (await admin.get("/config/settings")).data;
    expect((await admin.put("/config/settings", { ...cur, orgPhone: "0911000000", billPagumen: false })).status).toBe(200);
    const fd = new FormData(); fd.set("logo", new Blob([PNG], { type: "image/png" }), "logo.png");
    expect((await admin.req("POST", "/config/settings/logo", undefined, fd)).status).toBe(200);
    const logo = await new Client(base).get("/public/logo");
    expect(logo.status).toBe(200); expect(logo.headers.get("content-type")).toBe("image/png");
    const pdf = await finance.get(`/reports/export?type=summary&format=pdf`);
    expect(pdf.status).toBe(200);                                               // PDF with logo still renders
  });
});
