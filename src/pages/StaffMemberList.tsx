import { useState } from "react";
import { Link } from "react-router-dom";
import { api, startDownload } from "../api";
import { Icon } from "../icons";
import { Button, ConfirmModal, copyText, Empty, errMsg, Field, Loading, PageHead, Pager, Select, useData, useLookups, useToast } from "../ui";
import { useBase } from "./StaffShell";

interface F { search: string; departmentId: string; categoryId: string; credStatus: string }
const EMPTY: F = { search: "", departmentId: "", categoryId: "", credStatus: "" };
const COLS = [
  { key: "dept", label: "የአገልግሎት ክፍል" }, { key: "type", label: "የአባል አይነት" }, { key: "status", label: "የመግቢያ ሁኔታ" },
  { key: "password", label: "የመጀመሪያ ይለፍ ቃል" }, { key: "phone", label: "ስልክ ቁጥር (መግቢያ)" }, { key: "code", label: "የአባል መለያ" },
];
const NOTICE = "ማስታወሻ፦ ይህ ይለፍ ቃል ለመጀመሪያ ጊዜ መግቢያ ብቻ ነው። አባሉ በመጀመሪያ ጊዜ ከገባ በኋላ ወዲያውኑ የግል ይለፍ ቃሉን መቀየር አለበት። የይለፍ ቃልዎን ለሌላ ሰው አያጋሩ።";

export function MemberListPage() {
  const base = useBase();
  const toast = useToast();
  const { data: lk } = useLookups();
  const [draft, setDraft] = useState<F>(EMPTY);
  const [applied, setApplied] = useState<F>(EMPTY);
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState<string[]>(["dept", "type", "password"]);
  const [shown, setShown] = useState<Record<number, string>>({});
  const [confirm, setConfirm] = useState(false);
  const params = { search: applied.search, departmentId: applied.departmentId, categoryId: applied.categoryId, credStatus: applied.credStatus };
  const { data, loading, error, reload } = useData(() => api.get("/member-list", { ...params, page }), [JSON.stringify(params), page]);
  const opts = (l?: { id: number; name: string }[]) => (l ?? []).map((x) => ({ value: x.id, label: x.name }));
  const colsParam = COLS.map((c) => c.key).filter((k) => cols.includes(k)).join(",");
  const dl = (format: string, extra: Record<string, any> = {}) => startDownload("/member-list/export", { ...params, cols: colsParam, format, ...extra });
  const toggle = (k: string) => setCols((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  const reveal = async (id: number) => {
    try { const r = await api.get(`/member-list/${id}/initial-password`); setShown((s) => ({ ...s, [id]: r.password })); }
    catch (e) { toast(errMsg(e), "error"); reload(); }
  };
  const generate = async () => {
    try {
      let remaining = 1;
      while (remaining > 0) { const r = await api.post("/member-list/generate-missing"); remaining = r.remaining; }
      toast("የጎደሉት የመጀመሪያ ይለፍ ቃሎች ተፈጥረዋል።"); setConfirm(false); reload();
    } catch (e) { toast(errMsg(e), "error"); setConfirm(false); }
  };

  return (
    <>
      <PageHead title="የአባላት ዝርዝር" />
      <div className="notice warn small">{NOTICE}</div>

      <form className="panel mb" onSubmit={(e) => { e.preventDefault(); setApplied(draft); setPage(1); }}>
        <div className="filters">
          <Field label="የአባል ስም" className="wide"><input className="input" value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} placeholder="ስም፣ የአባል መለያ ወይም ስልክ ቁጥር" /></Field>
          <Field label="የአገልግሎት ክፍል"><Select all="ሁሉም" value={draft.departmentId} onChange={(v) => setDraft({ ...draft, departmentId: v })} options={opts(lk?.departments)} /></Field>
          <Field label="የአባል አይነት"><Select all="ሁሉም" value={draft.categoryId} onChange={(v) => setDraft({ ...draft, categoryId: v })} options={opts(lk?.categories)} /></Field>
          <Field label="የመግቢያ ሁኔታ"><Select all="ሁሉም" value={draft.credStatus} onChange={(v) => setDraft({ ...draft, credStatus: v })} options={[{ value: "pending", label: "ይለፍ ቃል አልተቀየረም" }, { value: "changed", label: "ይለፍ ቃል ተቀይሯል" }]} /></Field>
        </div>
        <div className="row mt"><Button type="submit">ፈልግ</Button><Button variant="ghost" onClick={() => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); }}>አጽዳ</Button></div>
      </form>

      <div className="panel mb">
        <div className="panel-title"><h2>አውርድ</h2></div>
        <div className="small muted mb">በሠንጠረዡ ላይ ያሉት ማጣሪያዎች ተግባራዊ ይሆናሉ። ምንም ማጣሪያ ካልተመረጠ ሁሉም አባላት ይወርዳሉ።</div>
        <div className="row" style={{ gap: 18 }}>
          <label className="row gap-s"><input type="checkbox" checked disabled style={{ width: 18, height: 18 }} />የአባል ስም</label>
          {COLS.map((c) => <label key={c.key} className="row gap-s" style={{ cursor: "pointer" }}><input type="checkbox" style={{ width: 18, height: 18 }} checked={cols.includes(c.key)} onChange={() => toggle(c.key)} />{c.label}</label>)}
        </div>
        <div className="row mt">
          <Button variant="secondary" onClick={() => dl("xlsx")}><Icon name="download" />ኤክሴል አውርድ</Button>
          <Button variant="secondary" onClick={() => dl("pdf")}><Icon name="file" />ፒዲኤፍ አውርድ</Button>
        </div>
        <div className="row mt-s">
          <span className="small muted">ላልቀየሩ አባላት የመጀመሪያ መግቢያ መረጃ ብቻ፦</span>
          <Button size="small" onClick={() => dl("pdf", { credStatus: "pending", cols: "dept,type,password" })}>ፒዲኤፍ</Button>
          <Button size="small" variant="secondary" onClick={() => dl("xlsx", { credStatus: "pending", cols: "dept,type,password" })}>ኤክሴል</Button>
        </div>
      </div>

      {data && data.missingCount > 0 && (
        <div className="notice info">
          <b>{data.missingCount} አባላት የመጀመሪያ ይለፍ ቃላቸው በሥርዓቱ አልተቀመጠም።</b>
          <div className="small mt-s">እነዚህ አባላት ከዚህ ማሻሻያ በፊት የተመዘገቡ ናቸው። ገና ይለፍ ቃላቸውን ካልቀየሩ አዲስ የመጀመሪያ ይለፍ ቃል መፍጠር ይችላሉ።</div>
          <div className="mt-s"><Button size="small" onClick={() => setConfirm(true)}>የጎደሉ የመጀመሪያ ይለፍ ቃሎችን ፍጠር</Button></div>
        </div>
      )}

      {error && <div className="notice error">{error}</div>}
      {loading && !data ? <Loading /> : !data || data.rows.length === 0 ? <div className="panel"><Empty>ምንም አባል አልተገኘም።</Empty></div> : (
        <>
          <div className="small muted mb">ጠቅላላ አባላት፦ {data.total}</div>
          <div className="table-wrap">
            <table className="t cards">
              <thead><tr><th>ተ.ቁ</th><th>የአባል ስም</th><th>የአገልግሎት ክፍል</th><th>የአባል አይነት</th><th>የመግቢያ ሁኔታ</th><th>የመጀመሪያ ይለፍ ቃል</th></tr></thead>
              <tbody>
                {data.rows.map((r: any, i: number) => (
                  <tr key={r.id}>
                    <td data-label="ተ.ቁ">{(data.page - 1) * data.pageSize + i + 1}</td>
                    <td data-label="የአባል ስም"><Link to={`${base}/members/${r.id}`}><b>{r.full_name}</b></Link><div className="small muted">{r.member_code}</div></td>
                    <td data-label="የአገልግሎት ክፍል">{r.department}</td><td data-label="የአባል አይነት">{r.category}</td>
                    <td data-label="የመግቢያ ሁኔታ">{r.must_change_password ? <span className="badge PENDING">ይለፍ ቃል አልተቀየረም</span> : <span className="badge PAID">ይለፍ ቃል ተቀይሯል</span>}</td>
                    <td data-label="የመጀመሪያ ይለፍ ቃል">
                      {!r.must_change_password ? <span className="muted">የይለፍ ቃል ተቀይሯል</span>
                        : shown[r.id] ? <span className="row gap-s"><b style={{ fontSize: 17, letterSpacing: 1 }}>{shown[r.id]}</b>
                            <Button size="small" variant="ghost" onClick={() => copyText(shown[r.id], toast)}><Icon name="copy" /></Button>
                            <Button size="small" variant="ghost" onClick={() => setShown((s) => { const n = { ...s }; delete n[r.id]; return n; })}>ደብቅ</Button></span>
                        : r.has_initial ? <span className="row gap-s"><span>••••••••</span><Button size="small" variant="secondary" onClick={() => reveal(r.id)}>የመጀመሪያ ይለፍ ቃል አሳይ</Button></span>
                        : <span className="muted small">አልተቀመጠም</span>}
                      {shown[r.id] && <div className="small" style={{ color: "var(--warn)", marginTop: 4 }}>ለመጀመሪያ ጊዜ መግቢያ ብቻ ነው፤ አባሉ ከገባ በኋላ ይቀይረዋል።</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </>
      )}
      {confirm && <ConfirmModal title="የመጀመሪያ ይለፍ ቃሎችን መፍጠር" text={<>ይለፍ ቃላቸውን ገና ላልቀየሩና የመጀመሪያ ይለፍ ቃላቸው ላልተቀመጠ {data?.missingCount} አባላት አዲስ ይለፍ ቃል ይፈጠራል። የድሮው ይለፍ ቃላቸው ከዚያ በኋላ አይሰራም።</>} confirmLabel="ፍጠር" onClose={() => setConfirm(false)} onConfirm={generate} />}
    </>
  );
}