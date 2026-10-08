import { useState } from "react";
import { Link } from "react-router-dom";
import { formatInstant, monthName } from "../../shared/calendar/ethiopian";
import { METHOD_LABEL, STATUS_LABEL } from "../../shared/labels";
import { api } from "../api";
import { birr, DownloadButtons, Empty, Loading, Mark, PageHead, Pager, Select, StatusBadge, useData, useDebounced, useMeta } from "../ui";
import { FilterPanel, Filters } from "./StaffFilters";
import { useBase } from "./StaffShell";

const reportParams = (f: Filters, search?: string) => ({
  search, year: f.year, month: f.month, departmentId: f.departmentId, categoryId: f.categoryId, memberTypeId: f.memberTypeId,
  status: f.status, method: f.method, dateFrom: f.dateFrom, dateTo: f.dateTo, dateBasis: f.dateBasis, active: f.active,
});

// ───────── የክፍያ ሁኔታ (የዓመቱ ሠንጠረዥ) ─────────
export function MatrixPage() {
  const base = useBase();
  const { meta } = useMeta();
  const [f, setF] = useState<Filters>({ active: "1" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const year = f.year || meta?.currentPeriod.year || 0;
  const q = useDebounced(f.search);
  const params = { ...reportParams(f, q), year };
  const { data, loading, error } = useData(() => (year ? api.get("/reports/matrix", { ...params, page, pageSize: size }) : Promise.resolve(null)), [JSON.stringify(params), page, size]);
  const set = (p: Partial<Filters>) => { setF((o) => ({ ...o, ...p })); setPage(1); };
  const showPagume = !!meta?.billPagumen || (data?.rows ?? []).some((r: any) => r.months[12]);
  const months = Array.from({ length: showPagume ? 13 : 12 }, (_, i) => i);
  return (
    <>
      <PageHead title={`የ${year} ዓ.ም. የክፍያ ሁኔታ`}><DownloadButtons path="/reports/export" params={{ ...params, type: "matrix" }} /></PageHead>
      <FilterPanel f={{ ...f, year }} set={set} show={{ year: true, yearRequired: true, dept: true, category: true, type: true, status: true, active: true }} onReset={() => { setF({ active: "1" }); setPage(1); }} />
      <div className="legend mb"><span><Mark status="PAID" /> ተከፍሏል</span><span><Mark status="PENDING" /> በማረጋገጥ ላይ</span><span><Mark status="UNPAID" /> አልተከፈለም</span><span><Mark status="REJECTED" /> አልተቀበለም</span><span><Mark /> አይመለከተውም</span></div>
      {error && <div className="notice error">{error}</div>}
      {loading && !data ? <Loading /> : !data || data.rows.length === 0 ? <div className="panel"><Empty /></div> : (
        <>
          <div className="table-wrap" style={{ maxHeight: "70vh" }}>
            <table className="t matrix">
              <thead><tr><th className="sticky">አባል</th><th>ክፍል</th>{months.map((i) => <th key={i} className="m">{monthName(i + 1)}</th>)}<th className="num">የተከፈለ</th><th className="num">ያልተከፈለ</th></tr></thead>
              <tbody>{data.rows.map((r: any) => (
                <tr key={r.id}>
                  <td className="sticky" style={{ minWidth: 170 }}><Link to={`${base}/members/${r.id}`}><b>{r.full_name}</b></Link><div className="small muted">{r.member_code} • {r.category}</div></td>
                  <td className="small" style={{ minWidth: 130 }}>{r.department}</td>
                  {months.map((i) => <td key={i} className="m"><Mark status={r.months[i]?.status} /></td>)}
                  <td className="num">{birr(r.paid)}</td><td className="num" style={{ color: r.open ? "var(--red)" : undefined }}>{birr(r.open)}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="row between">
            <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
            <div className="row small muted">በገጽ፦ <div style={{ width: 90 }}><Select all={null} value={size} onChange={(v) => { setSize(Number(v)); setPage(1); }} options={[25, 50, 100].map((n) => ({ value: n, label: String(n) }))} /></div></div>
          </div>
        </>
      )}
    </>
  );
}

// ───────── ሪፖርት ─────────
type View = "summary" | "detail";
const GROUPS = [["none", "ጠቅላላ"], ["month", "በወር"], ["department", "በክፍል"], ["category", "በክፍያ ምድብ (ተማሪ / ሰራተኛ)"], ["memberType", "በአባልነት አይነት"], ["method", "በክፍያ ዘዴ"]] as const;

export function ReportsPage() {
  const { meta } = useMeta();
  const [f, setF] = useState<Filters>({});
  const [view, setView] = useState<View>("summary");
  const [group, setGroup] = useState<string>("month");
  const [page, setPage] = useState(1);
  const year = f.year || meta?.currentPeriod.year || 0;
  const q = useDebounced(f.search);
  const params = { ...reportParams(f, q), year };
  const key = JSON.stringify(params);
  const sum = useData(() => (year && view === "summary" ? api.get("/reports/summary", { ...params, groupBy: group }) : Promise.resolve(null)), [key, view, group]);
  const det = useData(() => (year && view === "detail" ? api.get("/reports/detail", { ...params, page }) : Promise.resolve(null)), [key, view, page]);
  const set = (p: Partial<Filters>) => { setF((o) => ({ ...o, ...p })); setPage(1); };
  const loading = view === "summary" ? sum.loading && !sum.data : det.loading && !det.data;
  const err = view === "summary" ? sum.error : det.error;
  const exportParams = view === "summary" ? { ...params, type: "summary", groupBy: group === "none" ? "month" : group } : { ...params, type: "detail" };
  const labelOf = (r: any) => (group === "month" ? `${monthName(r.label)} ${r.year}` : group === "method" ? METHOD_LABEL[r.label] ?? "—" : r.label);
  const t = sum.data?.totals;

  return (
    <>
      <PageHead title="ሪፖርት"><DownloadButtons path="/reports/export" params={exportParams} /></PageHead>
      <FilterPanel f={{ ...f, year }} set={set} show={{ year: true, yearRequired: true, month: true, dept: true, category: true, type: true, status: true, method: true, date: true, dateBasisChoice: true }} onReset={() => { setF({}); setPage(1); }} />
      <div className="row between mb">
        <div className="seg"><button className={view === "summary" ? "on" : ""} onClick={() => setView("summary")}>ማጠቃለያ</button><button className={view === "detail" ? "on" : ""} onClick={() => setView("detail")}>ዝርዝር</button></div>
        {view === "summary" && <div style={{ minWidth: 240 }}><Select all={null} value={group} onChange={setGroup} options={GROUPS.map(([value, label]) => ({ value, label }))} /></div>}
      </div>
      {err && <div className="notice error">{err}</div>}
      {loading ? <Loading /> : view === "summary" && t ? (
        <>
          <div className="panel mb"><div className="stats">
            <div className="stat"><div className="v">{t.members}</div><div className="k">ጠቅላላ አባላት</div></div>
            <div className="stat g"><div className="v">{t.members_paid}</div><div className="k">የከፈሉ</div></div>
            <div className="stat r"><div className="v">{t.members_unpaid}</div><div className="k">ያልከፈሉ</div></div>
            <div className="stat a"><div className="v">{t.members_pending}</div><div className="k">በማረጋገጥ ላይ</div></div>
          </div><hr style={{ border: 0, borderTop: "1px solid var(--gray-200)", margin: "10px 0" }} />
          <div className="stats">
            <div className="stat g"><div className="v">{birr(t.collected)}</div><div className="k">የተሰበሰበ ገንዘብ</div></div>
            <div className="stat"><div className="v">{birr(t.expected)}</div><div className="k">የሚጠበቅ ገንዘብ</div></div>
            <div className="stat r"><div className="v">{birr(t.unpaid_amount)}</div><div className="k">ያልተሰበሰበ</div></div>
            <div className="stat a"><div className="v">{birr(t.pending_amount)}</div><div className="k">በማረጋገጥ ላይ ያለ</div></div>
          </div></div>
          <div className="small muted mb">«ያልተሰበሰበ» ማለት ያልተከፈለና የተቀበለ ያልሆነ መጠን ነው። በማረጋገጥ ላይ ያለው ለብቻው ይታያል።</div>
          {group !== "none" && (sum.data.groups.length === 0 ? <div className="panel"><Empty /></div> : (
            <div className="table-wrap"><table className="t cards">
              <thead><tr><th>{GROUPS.find((g) => g[0] === group)?.[1].replace("በ", "")}</th><th className="num">አባላት</th><th className="num">የከፈሉ</th><th className="num">ያልከፈሉ</th><th className="num">በማረጋገጥ ላይ</th><th className="num">የሚጠበቅ</th><th className="num">የተሰበሰበ</th><th className="num">ያልተሰበሰበ</th></tr></thead>
              <tbody>{sum.data.groups.map((r: any) => (
                <tr key={r.key}><td data-label="ቡድን"><b>{labelOf(r)}</b></td><td data-label="አባላት" className="num">{r.members}</td><td data-label="የከፈሉ" className="num">{r.members_paid}</td><td data-label="ያልከፈሉ" className="num">{r.members_unpaid}</td><td data-label="በማረጋገጥ ላይ" className="num">{r.members_pending}</td>
                  <td data-label="የሚጠበቅ" className="num">{birr(r.expected)}</td><td data-label="የተሰበሰበ" className="num" style={{ color: "var(--green)" }}>{birr(r.collected)}</td><td data-label="ያልተሰበሰበ" className="num">{birr(r.unpaid_amount)}</td></tr>))}</tbody>
              <tfoot><tr><td>ጠቅላላ</td><td className="num">{t.members}</td><td className="num">{t.members_paid}</td><td className="num">{t.members_unpaid}</td><td className="num">{t.members_pending}</td><td className="num">{birr(t.expected)}</td><td className="num">{birr(t.collected)}</td><td className="num">{birr(t.unpaid_amount)}</td></tr></tfoot>
            </table></div>
          ))}
        </>
      ) : view === "detail" && det.data ? (
        det.data.rows.length === 0 ? <div className="panel"><Empty /></div> : (
          <>
            <div className="panel mb"><div className="stats"><div className="stat"><div className="v">{det.data.total}</div><div className="k">መዝገቦች</div></div><div className="stat"><div className="v">{birr(det.data.expected)}</div><div className="k">የሚጠበቅ</div></div><div className="stat g"><div className="v">{birr(det.data.collected)}</div><div className="k">የተሰበሰበ</div></div></div></div>
            <div className="table-wrap"><table className="t cards">
              <thead><tr><th>የአባል መለያ</th><th>ስም</th><th>ክፍል</th><th>ምድብ</th><th>ወር</th><th className="num">የሚከፈል</th><th className="num">የተከፈለ</th><th>ሁኔታ</th><th>ዘዴ</th><th>የክፍያ ቀን</th></tr></thead>
              <tbody>{det.data.rows.map((r: any) => (
                <tr key={r.id}><td data-label="የአባል መለያ">{r.member_code}</td><td data-label="ስም"><b>{r.full_name}</b></td><td data-label="ክፍል">{r.department}</td><td data-label="ምድብ">{r.category}</td>
                  <td data-label="ወር" className="nowrap">{r.ethiopian_year} {monthName(r.ethiopian_month)}</td><td data-label="የሚከፈል" className="num">{birr(r.expected)}</td><td data-label="የተከፈለ" className="num">{birr(r.paid)}</td>
                  <td data-label="ሁኔታ"><StatusBadge status={r.status} /></td><td data-label="ዘዴ">{r.method ? METHOD_LABEL[r.method] : "—"}</td><td data-label="የክፍያ ቀን" className="nowrap">{r.paid_at ? formatInstant(r.paid_at) : "—"}</td></tr>))}</tbody>
            </table></div>
            <Pager page={det.data.page} pageSize={det.data.pageSize} total={det.data.total} onChange={setPage} />
          </>
        )
      ) : null}
      <div className="small muted mt">ሁኔታዎች፦ {Object.values(STATUS_LABEL).join(" • ")}</div>
    </>
  );
}
