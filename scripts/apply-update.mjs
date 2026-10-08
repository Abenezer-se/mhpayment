// One-time update script. Run from the project folder:   node scripts/apply-update.mjs
// It makes many small, safe edits (remove emoji, Amharic labels, Amharic file names, Excel status words, icons, theme toggle).
// It can be run twice without harm. Every edit is reported.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const abs = (f) => path.join(root, f);
const read = (f) => fs.readFileSync(abs(f), "utf8");
const write = (f, s) => fs.writeFileSync(abs(f), s, "utf8");
let problems = 0;
const ok = (m) => console.log("  ✓ " + m);
const warn = (m) => { problems++; console.log("  ✗ " + m); };

function edit(file, pairs) {
  if (!fs.existsSync(abs(file))) return warn(`${file}: ፋይሉ አልተገኘም`);
  let s = read(file);
  for (const [find, repl, label] of pairs) {
    if (repl && s.includes(repl)) console.log(`  - ${file}: ${label} (ቀድሞ ተደርጓል)`);
    else if (s.includes(find)) { s = s.split(find).join(repl); ok(`${file}: ${label}`); }
    else warn(`${file}: «${label}» የሚቀየረው ጽሑፍ አልተገኘም`);
  }
  write(file, s);
}
function between(s, start, end, replacement, label, file) {
  const a = s.indexOf(start), b = s.indexOf(end);
  if (a < 0 || b < 0 || b < a) { warn(`${file}: «${label}» አልተገኘም`); return s; }
  ok(`${file}: ${label}`);
  return s.slice(0, a) + replacement + s.slice(b);
}

console.log("\n1) src/ui.tsx");
{
  const f = "src/ui.tsx";
  let s = read(f);
  if (s.includes('from "./icons"')) console.log("  - ቀድሞ ተደርጓል");
  else {
    s = s.replace('import { api, ApiError, startDownload } from "./api";', 'import { api, ApiError, startDownload } from "./api";\nimport { Icon } from "./icons";');
    s = between(s, "  return (\n    <div className={`logo-fallback", "// ───────── lookups", `  return (
    <div className={\`logo-fallback \${className}\`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 3v18M6 9h12" /></svg>
    </div>
  );
}

`, "አርማ", f);
    s = between(s, "export function Mark(", "export function Loading()", `export function Mark({ status }: { status?: string | null }) {
  const label = status ? STATUS_LABEL[status] : "አይመለከተውም";
  return (
    <span className={\`mark \${status ?? "NONE"}\`} title={label} role="img" aria-label={label}>
      {status === "PAID" ? <Icon name="check" /> : status === "PENDING" ? <Icon name="dots" /> : status === "UNPAID" || status === "REJECTED" ? <Icon name="x" /> : <span className="dash" />}
    </span>
  );
}

`, "የሁኔታ ምልክቶች", f);
    s = between(s, "export function Pager(", "/** Ethiopian date picker", `export function Pager({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1, to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span>{from}–{to} ከ {money(total)}</span>
      <div className="row">
        <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => onChange(1)}>መጀመሪያ</Button>
        <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => onChange(page - 1)}>ቀዳሚ</Button>
        <span>ገጽ {page} / {pages}</span>
        <Button variant="secondary" size="small" disabled={page >= pages} onClick={() => onChange(page + 1)}>ቀጣይ</Button>
        <Button variant="secondary" size="small" disabled={page >= pages} onClick={() => onChange(pages)}>መጨረሻ</Button>
      </div>
    </div>
  );
}

`, "የገጽ መቀያየሪያ", f);
    s = between(s, "export function DownloadButtons(", "export function PageHead(", `export function DownloadButtons({ path, params, labels }: { path: string; params?: Record<string, any>; labels?: [string, string] }) {
  return (
    <div className="dl">
      <Button variant="secondary" size="small" onClick={() => startDownload(path, { ...params, format: "xlsx" })}><Icon name="download" />{labels?.[0] ?? "ኤክሴል አውርድ"}</Button>
      <Button variant="secondary" size="small" onClick={() => startDownload(path, { ...params, format: "pdf" })}><Icon name="file" />{labels?.[1] ?? "ፒዲኤፍ አውርድ"}</Button>
    </div>
  );
}

`, "የማውረጃ ቁልፎች", f);
    write(f, s);
  }
}

console.log("\n2) src/pages/StaffShell.tsx");
edit("src/pages/StaffShell.tsx", [
  ['import { useAuth } from "../auth";', 'import { useAuth } from "../auth";\nimport { Icon } from "../icons";\nimport { ThemeToggle } from "../theme";', "icon/theme imports"],
  ['            <Link to={`${base}/password`} className="btn ghost small">🔑</Link>\n', '            <ThemeToggle />\n            <Link to={`${base}/password`} className="btn ghost small">የይለፍ ቃል</Link>\n', "theme toggle + password link"],
  ['<Link to={`${base}/members/new`}>＋ አዲስ አባል</Link>', '<Link to={`${base}/members/new`}><Icon name="plus" />አዲስ አባል</Link>', "quick link 1"],
  ['<Link to={`${base}/members`}>＋ ክፍያ መመዝገብ</Link>', '<Link to={`${base}/members`}><Icon name="card" />ክፍያ መመዝገብ</Link>', "quick link 2"],
  ['<Link to={`${base}/status`}>📊 የክፍያ ሁኔታ</Link>', '<Link to={`${base}/status`}><Icon name="table" />የክፍያ ሁኔታ</Link>', "quick link 3"],
  ['<Link to={`${base}/reports`}>📥 ሪፖርት</Link>', '<Link to={`${base}/reports`}><Icon name="download" />ሪፖርት</Link>', "quick link 4"],
  ['className="row between" style={{ padding: "9px 0", borderBottom: "1px solid var(--gray-100)", color: "inherit", textDecoration: "none" }}', 'className="list-link"', "list rows"],
]);

console.log("\n3) src/pages/*.tsx — emoji ተወግደዋል፣ የአማርኛ ጽሑፎች");
{
  const dir = abs("src/pages");
  const symbols = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{FF0B}\u{2190}\u{2197}][ \u00A0]?/gu;
  let removed = 0;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
    let s = fs.readFileSync(path.join(dir, name), "utf8");
    const before = s;
    s = s.split('{k === "CASH" ? "💵 " : "📱 "}').join("");
    s = s.split("Excel አውርድ").join("ኤክሴል አውርድ").split("PDF አውርድ").join("ፒዲኤፍ አውርድ");
    s = s.replace(symbols, () => { removed++; return ""; });
    if (s !== before) fs.writeFileSync(path.join(dir, name), s, "utf8");
  }
  ok(`${removed} emoji/ምልክቶች ተወግደዋል`);
}

console.log("\n4) የአማርኛ የፋይል ስሞች");
edit("server/routes/members.ts", [['fileBase: "registered-members"', 'fileBase: "የተመዘገቡ-አባላት"', "የአባላት ዝርዝር"]]);
edit("server/routes/payments.ts", [['fileBase: "payments"', 'fileBase: "የክፍያ-ታሪክ"', "የክፍያ ታሪክ"]]);
edit("server/routes/reports.ts", [
  ['fileBase: "payment-report"', 'fileBase: "የክፍያ-ዝርዝር-ሪፖርት"', "ዝርዝር ሪፖርት"],
  ['fileBase: "payment-summary"', 'fileBase: "የክፍያ-ማጠቃለያ-ሪፖርት"', "ማጠቃለያ ሪፖርት"],
  ['fileBase: "payment-status"', 'fileBase: "የክፍያ-ሁኔታ"', "የክፍያ ሁኔታ"],
  ['legend: "✓ ተከፍሏል    … በማረጋገጥ ላይ    ✕ አልተከፈለም / አልተቀበለም    — አይመለከተውም",', 'legend: "በሴሎቹ ውስጥ ያሉት ቃላት የወሩን የክፍያ ሁኔታ ያሳያሉ፤ «—» ማለት ለዚህ አባል የማይመለከት ወር ነው።",', "የExcel መግለጫ"],
  ['key: `m${i}`, width: 8, type: "mark" as const', 'key: `m${i}`, width: 11, type: "mark" as const', "የወር ዓምዶች ስፋት"],
]);

console.log("\n5) Excel — የሁኔታ ምልክቶች በአማርኛ ቃላት");
edit("server/services/exports.ts", [
  ['const markText: Record<string, [string, string]> = { PAID: ["✓", "FF1E8E5A"], PENDING: ["…", "FFB7791F"], UNPAID: ["✕", "FF8A97A6"], REJECTED: ["✕", "FFC0392B"] };',
   'const markText: Record<string, [string, string]> = { PAID: ["ተከፍሏል", "FF16724B"], PENDING: ["በማረጋገጥ ላይ", "FF85570A"], UNPAID: ["አልተከፈለም", "FF4F6173"], REJECTED: ["አልተቀበለም", "FFAD3226"] };', "የሁኔታ ቃላት"],
  ['cell.font = { name: FONT, size: 12, bold: true, color: { argb: m ? m[1] : "FFB0BAC5" } };', 'cell.font = { name: FONT, size: 10, bold: true, color: { argb: m ? m[1] : "FFB0BAC5" } };', "ቅርጸ ቁምፊ"],
]);

console.log(problems ? `\n⚠ ${problems} ችግር(ች) አሉ — ከላይ ያሉትን ✗ መስመሮች ይላኩልኝ።\n` : "\n✓ ሁሉም ተጠናቅቋል። አሁን፦ npm run build\n");
process.exit(problems ? 1 : 0);