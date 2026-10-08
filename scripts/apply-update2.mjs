// Second update script. Run once from the project folder:   node scripts/apply-update2.mjs
// Safe to run twice. Every edit is reported; any line starting with ✗ means a text was not found.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const abs = (f) => path.join(root, f);
let problems = 0;
const ok = (m) => console.log("  ✓ " + m);
const warn = (m) => { problems++; console.log("  ✗ " + m); };

function edit(file, pairs) {
  if (!fs.existsSync(abs(file))) return warn(`${file}: ፋይሉ አልተገኘም`);
  let s = fs.readFileSync(abs(file), "utf8");
  for (const [find, repl, label] of pairs) {
    if (repl && s.includes(repl)) console.log(`  - ${file}: ${label} (ቀድሞ ተደርጓል)`);
    else if (s.includes(find)) { s = s.split(find).join(repl); ok(`${file}: ${label}`); }
    else warn(`${file}: «${label}» የሚቀየረው ጽሑፍ አልተገኘም`);
  }
  fs.writeFileSync(abs(file), s, "utf8");
}

console.log("\n1) ሪፖርቶች — የካቴድራል ስም ራስጌ፣ ማስታወሻዎች (server/services/exports.ts)");
edit("server/services/exports.ts", [
  ["totals?: Record<string, any>; landscape?: boolean; legend?: string; fileBase: string;", "totals?: Record<string, any>; landscape?: boolean; legend?: string; fileBase: string;\n  summaryLines?: string[]; notes?: string[];", "TableSpec"],
  ['  doc.font("bold").fontSize(15).fillColor(BLUE_DARK).text(s.orgName, textX, 38, { width: width - (textX - left) });',
   '  if (s.orgParent) doc.font("bold").fontSize(12).fillColor(BLUE_DARK).text(s.orgParent, textX, 36, { width: width - (textX - left) });\n  doc.font("bold").fontSize(15).fillColor(BLUE_DARK).text(s.orgName, textX, s.orgParent ? doc.y + 1 : 38, { width: width - (textX - left) });', "PDF ራስጌ"],
  ["  const range = doc.bufferedPageRange();",
   `  const ensure = (h: number) => { if (doc.y + h > bottomLimit()) doc.addPage(); };
  if (spec.summaryLines?.length) {
    doc.y += 10;
    for (const l of spec.summaryLines) { ensure(26); doc.font("bold").fontSize(12).fillColor(BLUE_DARK).text(l, left, doc.y + 4, { width: usable }); }
  }
  if (spec.notes?.length) {
    doc.y += 10;
    for (const n of spec.notes) {
      doc.font("bold").fontSize(9.5);
      const h = doc.heightOfString(n, { width: usable - 16 }) + 10;
      ensure(h + 4);
      const y = doc.y + 4;
      doc.save().rect(left, y, usable, h).fill("#FFF6DD").restore();
      doc.save().rect(left, y, 3, h).fill("#B08429").restore();
      doc.font("bold").fontSize(9.5).fillColor(TEXT).text(n, left + 10, y + 5, { width: usable - 16 });
      doc.y = y + h;
    }
  }
  const range = doc.bufferedPageRange();`, "PDF ማስታወሻዎች"],
  [`  putTitle(1, s.orgName, 16, true, BLUE_DARK);
  putTitle(2, spec.title, 13, true, TEXT);
  putTitle(3, (spec.filterLines ?? []).join("  |  ") || " ", 10, false, MUTED);
  putTitle(4, generatedLine(), 10, false, MUTED);`,
   `  putTitle(1, s.orgParent || " ", 12, true, BLUE_DARK);
  putTitle(2, s.orgName, 16, true, BLUE_DARK);
  putTitle(3, spec.title, 13, true, TEXT);
  putTitle(4, [...(spec.filterLines ?? []), generatedLine()].join("  |  "), 10, false, MUTED);`, "Excel ራስጌ"],
  ["  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: n } };",
   `  let noteRow = 9 + spec.rows.length + (spec.legend ? 2 : 0);
  for (const line of [...(spec.summaryLines ?? []), ...(spec.notes ?? [])]) {
    const r = ws.getRow(noteRow++);
    r.getCell(1).value = line;
    r.getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: "FF174B7A" } };
    r.getCell(1).alignment = { wrapText: true, vertical: "top" };
    if (n > 1) ws.mergeCells(r.number, 1, r.number, n);
    r.height = line.length > 90 ? 34 : 20;
  }
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: n } };`, "Excel ማስታወሻዎች"],
]);

console.log("\n2) ቅንብር — የካቴድራል ስም (settings.ts, config.ts, StaffAdmin.tsx)");
edit("server/services/settings.ts", [
  ["orgName: string; orgPhone: string; orgEmail: string; orgAddress: string; orgDescription: string;", "orgName: string; orgParent: string; orgPhone: string; orgEmail: string; orgAddress: string; orgDescription: string;", "interface"],
  ['orgName: "መሠረተ ሕይወት ሰንበት ትምህርት ቤት", orgPhone: "",', 'orgName: "መሠረተ ሕይወት ሰንበት ትምህርት ቤት", orgParent: "የደብረሰላም መድኃኔዓለም ካቴድራል", orgPhone: "",', "ነባሪ ስም"],
  ['orgName: "org_name", orgPhone: "org_phone",', 'orgName: "org_name", orgParent: "org_parent", orgPhone: "org_phone",', "ቁልፍ"],
]);
edit("server/routes/config.ts", [
  ['orgAddress: z.string().trim().max(250).default(""), orgDescription: z.string().trim().max(500).default(""),', 'orgAddress: z.string().trim().max(250).default(""), orgDescription: z.string().trim().max(500).default(""), orgParent: z.string().trim().max(150).optional(),', "settingsBody"],
  ['await setSetting(c, "org_description", b.orgDescription, uid);', 'await setSetting(c, "org_description", b.orgDescription, uid); if (b.orgParent !== undefined) await setSetting(c, "org_parent", b.orgParent, uid);', "setSetting"],
]);
edit("src/pages/StaffAdmin.tsx", [
  ["{ orgName: form.orgName, orgPhone: form.orgPhone,", "{ orgName: form.orgName, orgParent: form.orgParent ?? \"\", orgPhone: form.orgPhone,", "የማስቀመጫ መረጃ"],
  ['<Field label="የድርጅቱ ስም"><input className="input" value={form.orgName} onChange={(e) => set({ orgName: e.target.value })} required /></Field>',
   '<Field label="የካቴድራል ስም" hint="በሪፖርቶች ራስጌ ላይ ከትምህርት ቤቱ ስም በላይ ይታያል።"><input className="input" value={form.orgParent ?? ""} onChange={(e) => set({ orgParent: e.target.value })} /></Field>\n          <Field label="የድርጅቱ ስም"><input className="input" value={form.orgName} onChange={(e) => set({ orgName: e.target.value })} required /></Field>', "የካቴድራል ስም መስክ"],
]);

console.log("\n3) የመጀመሪያ ይለፍ ቃል — በምዝገባ ጊዜ በምስጢር መቀመጥ፣ ከመጀመሪያ ለውጥ በኋላ መሰረዝ");
edit("server/services/members.ts", [
  ['import { normalizePhone } from "../lib/phone";', 'import { normalizePhone } from "../lib/phone";\nimport { encryptSecret } from "../lib/secret-box";', "import"],
  ["insert into users (role_id, phone, full_name, password_hash, must_change_password, created_by)", "insert into users (role_id, phone, full_name, password_hash, must_change_password, created_by, initial_password_enc, initial_password_at)", "ምዝገባ 1"],
  ["values ((select id from roles where code='MEMBER'), $1, $2, $3, true, $4) returning id", "values ((select id from roles where code='MEMBER'), $1, $2, $3, true, $4, $5, now()) returning id", "ምዝገባ 2"],
  ["[phone, input.fullName, hash, actor.id], c);", "[phone, input.fullName, hash, actor.id, encryptSecret(initialPassword)], c);", "ምዝገባ 3"],
  ["failed_attempts=0, locked_until=null, updated_at=now() where id=$2`, [hash, userId], c);",
   "failed_attempts=0, locked_until=null, initial_password_enc=$3, initial_password_at=case when $3::text is null then null else now() end, updated_at=now() where id=$2`, [hash, userId, entity.type === \"member\" ? encryptSecret(pw) : null], c);", "አዲስ ይለፍ ቃል መስጠት"],
]);
edit("server/routes/auth.ts", [
  ["update users set password_hash=$1, must_change_password=false, token_version=token_version+1, updated_at=now() where id=$2 returning token_version",
   "update users set password_hash=$1, must_change_password=false, initial_password_enc=null, initial_password_at=null, token_version=token_version+1, updated_at=now() where id=$2 returning token_version", "የመጀመሪያው ይለፍ ቃል መሰረዝ"],
]);
edit("shared/labels.ts", [
  ['  STAFF_UPDATED: "የገንዘብ ያዥ መረጃ ተሻሽሏል",\n};', '  STAFF_UPDATED: "የገንዘብ ያዥ መረጃ ተሻሽሏል",\n  CREDENTIAL_VIEWED: "የመጀመሪያ ይለፍ ቃል ታይቷል",\n  CREDENTIAL_EXPORTED: "የመጀመሪያ መግቢያ መረጃ ወርዷል",\n  CREDENTIALS_GENERATED: "የመጀመሪያ ይለፍ ቃሎች ተፈጥረዋል",\n};', "የተግባር ታሪክ ስሞች"],
]);

console.log("\n4) የመጀመሪያ መግቢያ ማሳሰቢያ (Auth.tsx)");
edit("src/pages/Auth.tsx", [
  ['<b>እባክዎ የይለፍ ቃልዎን ይቀይሩ።</b><div className="small">አሁን የገባበት የይለፍ ቃል የመጀመሪያ (ጊዜያዊ) ነው። ለደህንነትዎ በራስዎ የይለፍ ቃል ይተኩት።</div>', "<b>እባክዎ የመጀመሪያ ጊዜ የመግቢያ ይለፍ ቃልዎን ይቀይሩ። ለደህንነትዎ አዲስ የግል ይለፍ ቃል ያዘጋጁ።</b>", "ማሳሰቢያ"],
  ["<h1>እባክዎ የይለፍ ቃልዎን ይቀይሩ።</h1>", "<h1>የይለፍ ቃልዎን ይቀይሩ</h1>", "ርዕስ"],
  ["<h2>ከዚያ በኋላ ወደ ሥርዓቱ ይገባሉ።</h2>", "<h2>ይህ የመጀመሪያ ጊዜ መግቢያዎ ስለሆነ ለደህንነትዎ የመጀመሪያ ይለፍ ቃልዎን ወደ የግል ይለፍ ቃል መቀየር ያስፈልጋል።</h2>", "ማብራሪያ"],
  ['<Button type="submit" className="big mt" busy={busy}>የይለፍ ቃሌን ቀይር</Button>', '<Button type="submit" className="big mt" busy={busy}>{forced ? "ይለፍ ቃል ቀይር" : "የይለፍ ቃሌን ቀይር"}</Button>', "ቁልፍ"],
]);

console.log("\n5) ዳሽቦርድ ምናሌ — የአባላት ዝርዝር + የክፍያ ክትትል (StaffShell.tsx)");
edit("src/pages/StaffShell.tsx", [
  ['import { MemberDetailPage, MemberFormPage, MembersPage } from "./StaffMembers";', 'import { MemberDetailPage, MemberFormPage } from "./StaffMembers";\nimport { FollowUpPage } from "./StaffFollowUp";\nimport { MemberListPage } from "./StaffMemberList";', "imports"],
  ['["/members", "አባላት"], ', '["/members", "አባላት"], ["/member-list", "የአባላት ዝርዝር"], ', "ምናሌ"],
  ['<Route path="members" element={<MembersPage />} />', '<Route path="members" element={<FollowUpPage />} />\n            <Route path="member-list" element={<MemberListPage />} />', "መንገዶች"],
]);

console.log(problems ? `\n⚠ ${problems} ችግር(ች) አሉ — ✗ መስመሮቹን ይላኩልኝ።\n` : "\n✓ ሁሉም ተጠናቅቋል። አሁን፦ npm run migrate  እና  npm run build\n");
process.exit(problems ? 1 : 0);