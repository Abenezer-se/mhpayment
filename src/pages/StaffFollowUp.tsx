import { useState } from "react";
import { Link } from "react-router-dom";
import { ETHIOPIAN_MONTHS } from "../../shared/calendar/ethiopian";
import { api, startDownload } from "../api";
import { Icon } from "../icons";
import { Button, birr, copyText, Empty, errMsg, Field, Loading, Meta, Pager, Select, useData, useLookups, useMeta, useToast } from "../ui";
import { useBase } from "./StaffShell";

interface Applied { search: string; status: string; categoryId: string; departmentId: string; fromYear: string; fromMonth: string; toYear: string; toMonth: string; includePending: boolean }

const COLS = [
  { key: "type", label: "የአባል አይነት" }, { key: "dept", label: "የአገልግሎት ክፍል" },
  { key: "paidMonths", label: "የተከፈሉ ወራት" }, { key: "paidCount", label: "የተከፈሉ ወራት ብዛት" }, { key: "paidAmount", label: "የተከፈለ መጠን" },
  { key: "unpaidMonths", label: "ያልተከፈሉ ወራት" }, { key: "unpaidCount", label: "ያልተከፈሉ ወራት ብዛት" }, { key: "unpaidAmount", label: "ያልተከፈለ መጠን" },
  { key: "pendingMonths", label: "በማረጋገጥ ላይ ያሉ ወራት" },
];
const DEFAULT_COLS: Record<string, string[]> = {
  paid: ["type", "dept", "paidMonths", "paidCount", "paidAmount"],
  unpaid: ["type", "dept", "unpaidMonths", "unpaidCount", "unpaidAmount"],
  all: ["type", "dept", "paidMonths", "paidAmount", "unpaidMonths", "unpaidCount", "unpaidAmount"],
  partial: ["type", "dept", "paidMonths", "paidAmount", "unpaidMonths", "unpaidCount", "unpaidAmount"],
};
const STATUS_OPTIONS = [{ value: "all", label: "ሁሉም አባላት" }, { value: "paid", label: "የከፈሉ አባላት" }, { value: "unpaid", label: "ያልከፈሉ አባላት" }, { value: "partial", label: "በከፊል የከፈሉ አባላት" }];

function PeriodPick({ year, month, onYear, onMonth, startYear, endYear }: { year: string; month: string; onYear: (v: string) => void; onMonth: (v: string) => void; startYear: number; endYear: number }) {
  const years: number[] = []; for (let y = startYear; y <= endYear; y++) years.push(y);
  return (
    <div className="et-date" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
      <Select all={null} value={year} onChange={onYear} options={years.map((y) => ({ value: y, label: String(y) }))} />
      <Select all={null} value={month} onChange={onMonth} options={ETHIOPIAN_MONTHS.map((m, i) => ({ value: i + 1, label: m }))} />
    </div>
  );
}

export function FollowUpPage() {
  const { meta } = useMeta();
  if (!meta) return <Loading />;
  return <FollowUp meta={meta} />;
}

function FollowUp({ meta }: { meta: Meta }) {
  const base = useBase();
  const toast = useToast();
  const { data: lk } = useLookups();
  const defaults: Applied = {
    search: "", status: "all", categoryId: "", departmentId: "", includePending: false,
    fromYear: String(meta.startYear), fromMonth: "1", toYear: String(meta.currentPeriod.year), toMonth: String(meta.currentPeriod.month),
  };
  const [draft, setDraft] = useState<Applied>(defaults);
  const [applied, setApplied] = useState<Applied>(defaults);
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState<string[]>(DEFAULT_COLS.all);
  const [touched, setTouched] = useState(false);
  const set = (p: Partial<Applied>) => setDraft((d) => ({ ...d, ...p }));

  const q = (a: Applied) => ({ search: a.search, status: a.status, categoryId: a.categoryId, departmentId: a.departmentId, fromYear: a.fromYear, fromMonth: a.fromMonth, toYear: a.toYear, toMonth: a.toMonth, includePending: a.includePending ? "1" : undefined });
  const params = q(applied);
  const { data, loading, error } = useData(() => api.get("/followup", { ...params, page }), [JSON.stringify(params), page]);

  const apply = () => { setApplied(draft); setPage(1); if (!touched) setCols(DEFAULT_COLS[draft.status] ?? DEFAULT_COLS.all); };
  const reset = () => { setDraft(defaults); setApplied(defaults); setPage(1); setTouched(false); setCols(DEFAULT_COLS.all); };
  const toggleCol = (k: string) => { setTouched(true); setCols((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k])); };
  const colsParam = COLS.map((c) => c.key).filter((k) => cols.includes(k)).join(",");
  const dl = (format: string, type = "followup") => startDownload("/followup/export", { ...params, cols: colsParam, format, type });
  const copyTelegram = async () => { try { const r = await api.get("/followup/telegram-text", params); await copyText(r.text, toast); } catch (e) { toast(errMsg(e), "error"); } };

  const lookupOpts = (l?: { id: number; name: string }[]) => (l ?? []).map((x) => ({ value: x.id, label: x.name }));
  const cell = (r: any, key: string) => {
    switch (key) {
      case "type": return r.category;
      case "dept": return r.department;
      case "paidMonths": return r.paid.label || "—";
      case "paidCount": return r.paid.count;
      case "paidAmount": return birr(r.paid.amount);
      case "unpaidMonths": return r.unpaid.label || "—";
      case "unpaidCount": return r.unpaid.count;
      case "unpaidAmount": return birr(r.unpaid.amount);
      case "pendingMonths": return r.pending.label || "—";
      default: return "";
    }
  };
  const numeric = (k: string) => ["paidCount", "paidAmount", "unpaidCount", "unpaidAmount"].includes(k);
  const s = data?.summary;

  return (
    <>
      <div className="page-head"><h1>አባላት እና የክፍያ ክትትል</h1><Link to={`${base}/members/new`} className="btn"><Icon name="plus" />አዲስ አባል</Link></div>

      <div className="panel mb">
        <div className="stats">
          <div className="stat"><div className="v">{s?.total ?? "—"}</div><div className="k">ጠቅላላ አባላት</div></div>
          <div className="stat g"><div className="v">{s?.paid ?? "—"}</div><div className="k">የከፈሉ አባላት</div></div>
          <div className="stat r"><div className="v">{s?.unpaid ?? "—"}</div><div className="k">ያልከፈሉ አባላት</div></div>
          <div className="stat r"><div className="v">{s ? birr(s.unpaidAmount) : "—"}</div><div className="k">ጠቅላላ ያልተከፈለ መጠን</div></div>
        </div>
        {s && <div className="small muted mt-s">በከፊል የከፈሉ፦ {s.partial} • ጠቅላላ የተከፈለ፦ {birr(s.paidAmount)}</div>}
      </div>

      <form className="panel mb" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        <div className="filters">
          <Field label="የአባል ስም" className="wide"><input className="input" placeholder="ስም፣ የአባል መለያ ወይም ስልክ ቁጥር (ከተተወ ሁሉም አባላት)" value={draft.search} onChange={(e) => set({ search: e.target.value })} /></Field>
          <Field label="የክፍያ ሁኔታ"><Select all={null} value={draft.status} onChange={(v) => set({ status: v })} options={STATUS_OPTIONS} /></Field>
          <Field label="የአባል አይነት"><Select all="ሁሉም" value={draft.categoryId} onChange={(v) => set({ categoryId: v })} options={lookupOpts(lk?.categories)} /></Field>
          <Field label="የአገልግሎት ክፍል"><Select all="ሁሉም" value={draft.departmentId} onChange={(v) => set({ departmentId: v })} options={lookupOpts(lk?.departments)} /></Field>
        </div>
        <div className="filters mt-s">
          <Field label="ከወር"><PeriodPick year={draft.fromYear} month={draft.fromMonth} onYear={(v) => set({ fromYear: v })} onMonth={(v) => set({ fromMonth: v })} startYear={meta.startYear} endYear={meta.currentPeriod.year + 1} /></Field>
          <Field label="እስከ ወር"><PeriodPick year={draft.toYear} month={draft.toMonth} onYear={(v) => set({ toYear: v })} onMonth={(v) => set({ toMonth: v })} startYear={meta.startYear} endYear={meta.currentPeriod.year + 1} /></Field>
        </div>
        <label className="row mt-s" style={{ cursor: "pointer" }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={draft.includePending} onChange={(e) => set({ includePending: e.target.checked })} />በማረጋገጥ ላይ ያሉ ክፍያዎችንም እንደ ያልተከፈሉ ቁጠር</label>
        <div className="hint mt-s">«ያልከፈሉ» ማለት ያልተከፈለ ወር ያላቸው ሁሉም አባላት ናቸው፤ በከፊል የከፈሉትንም ያካትታል። ወራቱ በነባሪ እስከ አሁኑ ወር ድረስ ይቆጠራሉ። በማረጋገጥ ላይ ያለ ክፍያ እንደ ተከፈለ አይቆጠርም።</div>
        <div className="row mt"><Button type="submit">ፈልግ</Button><Button variant="ghost" onClick={reset}>አጽዳ</Button></div>
      </form>

      <div className="panel mb">
        <div className="panel-title"><h2>በሠንጠረዡና በወረደው ሰነድ ውስጥ የሚካተቱ መረጃዎች</h2></div>
        <div className="row" style={{ gap: 18 }}>
          <label className="row gap-s"><input type="checkbox" checked disabled style={{ width: 18, height: 18 }} />የአባል ስም</label>
          {COLS.map((c) => <label key={c.key} className="row gap-s" style={{ cursor: "pointer" }}><input type="checkbox" style={{ width: 18, height: 18 }} checked={cols.includes(c.key)} onChange={() => toggleCol(c.key)} />{c.label}</label>)}
        </div>
        <div className="row mt">
          <Button variant="secondary" onClick={() => dl("xlsx")}><Icon name="download" />ኤክሴል አውርድ</Button>
          <Button variant="secondary" onClick={() => dl("pdf")}><Icon name="file" />ፒዲኤፍ አውርድ</Button>
          <span className="muted small">|</span>
          <Button onClick={() => dl("pdf", "telegram")}><Icon name="file" />የቴሌግራም ሪፖርት (ፒዲኤፍ)</Button>
          <Button variant="secondary" onClick={() => dl("xlsx", "telegram")}>የቴሌግራም ሪፖርት (ኤክሴል)</Button>
          <Button variant="secondary" onClick={copyTelegram}><Icon name="copy" />ለቴሌግራም ጽሑፍ ቅዳ</Button>
        </div>
        <div className="hint mt-s">የቴሌግራም ሪፖርት ሁልጊዜ ያልከፈሉ አባላትን ብቻ (ስም፣ ያልተከፈሉ ወራት፣ ብዛት፣ የሚከፈል) ከታች ጠቅላላ መጠን ጋር ያወጣል። ሰነዱ ከተመረጡት ማጣሪያዎች ጋር ይመሳሰላል።</div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {loading && !data ? <Loading /> : !data || data.rows.length === 0 ? <div className="panel"><Empty>በተመረጡት ማጣሪያዎች ምንም አባል አልተገኘም።</Empty></div> : (
        <>
          <div className="table-wrap">
            <table className="t cards">
              <thead><tr><th>ተ.ቁ</th><th>የአባል ስም</th>{COLS.filter((c) => cols.includes(c.key)).map((c) => <th key={c.key} className={numeric(c.key) ? "num" : ""}>{c.label}</th>)}<th /></tr></thead>
              <tbody>
                {data.rows.map((r: any, i: number) => (
                  <tr key={r.id}>
                    <td data-label="ተ.ቁ">{(data.page - 1) * data.pageSize + i + 1}</td>
                    <td data-label="የአባል ስም"><Link to={`${base}/members/${r.id}`}><b>{r.full_name}</b></Link><div className="small muted">{r.member_code}</div>
                      {r.pending.count > 0 && !applied.includePending && <div className="small" style={{ color: "var(--warn)" }}>በማረጋገጥ ላይ፦ {r.pending.count} ወራት</div>}</td>
                    {COLS.filter((c) => cols.includes(c.key)).map((c) => <td key={c.key} data-label={c.label} className={numeric(c.key) ? "num" : ""}>{cell(r, c.key)}</td>)}
                    <td data-label=""><Link to={`${base}/members/${r.id}`} className="btn secondary small">ክፍያ መመዝገብ</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </>
      )}
    </>
  );
}