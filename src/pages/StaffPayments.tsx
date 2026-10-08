import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatInstant, formatPeriod } from "../../shared/calendar/ethiopian";
import { METHOD_LABEL } from "../../shared/labels";
import { api, startDownload } from "../api";
import { useAuth } from "../auth";
import { Button, birr, ConfirmModal, DownloadButtons, Empty, errMsg, Field, Loading, Modal, PageHead, Pager, TxBadge, useData, useDebounced, useToast } from "../ui";
import { FilterPanel, Filters } from "./StaffFilters";
import { useBase } from "./StaffShell";

const txParams = (f: Filters) => ({ search: f.search, txStatus: f.txStatus, method: f.method, year: f.year, month: f.month, departmentId: f.departmentId, categoryId: f.categoryId, dateFrom: f.dateFrom, dateTo: f.dateTo });

function TxTable({ rows, base }: { rows: any[]; base: string }) {
  return (
    <div className="table-wrap"><table className="t cards">
      <thead><tr><th>የማረጋገጫ ቁጥር</th><th>የክፍያ ቀን</th><th>አባል</th><th>ክፍል</th><th>ወራት</th><th className="num">መጠን</th><th>ዘዴ</th><th>ሁኔታ</th><th /></tr></thead>
      <tbody>{rows.map((t) => (
        <tr key={t.id}>
          <td data-label="የማረጋገጫ ቁጥር" className="nowrap"><Link to={`${base}/payments/${t.id}`}>{t.reference_no}</Link></td>
          <td data-label="የክፍያ ቀን" className="nowrap">{formatInstant(t.paid_at, true)}</td>
          <td data-label="አባል"><Link to={`${base}/members/${t.member_id}`}><b>{t.full_name}</b></Link><div className="small muted">{t.member_code}</div></td>
          <td data-label="ክፍል">{t.department}</td>
          <td data-label="ወራት" className="small">{(t.items ?? []).map((i: any) => formatPeriod(i.year, i.month)).join("፣ ")}</td>
          <td data-label="መጠን" className="num"><b>{birr(t.amount)}</b></td><td data-label="ዘዴ">{METHOD_LABEL[t.method]}</td><td data-label="ሁኔታ"><TxBadge status={t.status} /></td>
          <td data-label=""><Link to={`${base}/payments/${t.id}`} className="btn secondary small">{t.status === "PENDING" ? "እይ / አረጋግጥ" : "እይ"}</Link></td>
        </tr>))}</tbody>
    </table></div>
  );
}

// ───────── የሚጠባበቁ ማረጋገጫዎች ─────────
export function ReviewsPage() {
  const base = useBase();
  const [page, setPage] = useState(1);
  const { data, loading, error } = useData(() => api.get("/payments", { txStatus: "PENDING", page, pageSize: 25 }), [page]);
  return (
    <>
      <PageHead title="የሚጠባበቁ የክፍያ ማረጋገጫዎች" />
      {error && <div className="notice error">{error}</div>}
      {loading && !data ? <Loading /> : !data || data.rows.length === 0 ? <div className="panel"><Empty>የሚጠባበቅ ማረጋገጫ የለም። </Empty></div> : (
        <><TxTable rows={data.rows} base={base} /><Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} /></>
      )}
    </>
  );
}

// ───────── የክፍያ ታሪክ (ሁሉም) ─────────
export function PaymentsPage() {
  const base = useBase();
  const [f, setF] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const params = { ...txParams(f), search: useDebounced(f.search) };
  const { data, loading, error } = useData(() => api.get("/payments", { ...params, page }), [JSON.stringify(params), page]);
  const set = (p: Partial<Filters>) => { setF((o) => ({ ...o, ...p })); setPage(1); };
  return (
    <>
      <PageHead title="የአባላት የክፍያ ታሪክ"><DownloadButtons path="/payments/export" params={params} /></PageHead>
      <FilterPanel f={f} set={set} show={{ year: true, month: true, dept: true, category: true, txStatus: true, method: true, date: true }} onReset={() => { setF({}); setPage(1); }} />
      <div className="small muted mb">የቀን ክልሉ የሚመለከተው የክፍያውን ቀን ነው።</div>
      {error && <div className="notice error">{error}</div>}
      {loading && !data ? <Loading /> : !data || data.rows.length === 0 ? <div className="panel"><Empty /></div> : (
        <><TxTable rows={data.rows} base={base} /><Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} /></>
      )}
    </>
  );
}

// ───────── የክፍያ ማረጋገጫ (review screen) ─────────
export function PaymentDetailPage() {
  const { id } = useParams();
  const base = useBase();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { data: t, loading, error, reload } = useData(() => api.get(`/payments/${id}`), [id]);
  const [rejecting, setRejecting] = useState(false), [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<"approve" | "void" | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");

  if (loading && !t) return <Loading />;
  if (error || !t) return <div className="notice error">{error}</div>;
  const proof = t.proofList?.[0];
  const isPdf = proof?.mime_type === "application/pdf";

  const approve = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.post(`/payments/${id}/approve`); toast(r.message);
      const next = await api.get("/payments", { txStatus: "PENDING", pageSize: 1 });
      if (next.rows[0]) nav(`${base}/payments/${next.rows[0].id}`); else reload();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); setConfirm(null); }
  };
  const reject = async () => {
    setBusy(true); setErr("");
    try { const r = await api.post(`/payments/${id}/reject`, { reason }); toast(r.message); nav(`${base}/reviews`); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="የክፍያ ማረጋገጫ"><Link to={`${base}/reviews`} className="btn ghost small">ወደ ዝርዝሩ</Link></PageHead>
      {err && <div className="notice error" role="alert">{err}</div>}
      <div className="two" style={{ alignItems: "start" }}>
        <div className="panel">
          <div className="row between"><h2>{t.reference_no}</h2><TxBadge status={t.status} /></div>
          <dl className="info mt">
            <dt>አባል</dt><dd><Link to={`${base}/members/${t.member_id}`}>{t.full_name}</Link> <span className="muted small">({t.member_code})</span></dd>
            <dt>የክፍል</dt><dd>{t.department}</dd><dt>የክፍያ ምድብ</dt><dd>{t.category}</dd><dt>ስልክ</dt><dd>0{t.phone.slice(4)}</dd>
            <dt>የክፍያ ዘዴ</dt><dd>{METHOD_LABEL[t.method]}</dd>
            <dt>የገባበት ቀን</dt><dd>{formatInstant(t.paid_at, true)}</dd>
            {t.reviewed_at && <><dt>የታየበት ቀን</dt><dd>{formatInstant(t.reviewed_at, true)} {t.reviewed_by_name && <span className="muted small">• {t.reviewed_by_name}</span>}</dd></>}
            {t.note && <><dt>ማስታወሻ</dt><dd>{t.note}</dd></>}
            {t.reject_reason && <><dt>ምክንያት</dt><dd style={{ color: "var(--red)" }}>{t.reject_reason}</dd></>}
          </dl>
          <h3 className="mt">ወራት</h3>
          <div className="mt-s">{(t.items ?? []).map((i: any, k: number) => <div key={k} className="row between" style={{ padding: "6px 0", borderBottom: "1px solid var(--gray-100)" }}><span>{formatPeriod(i.year, i.month)}</span><span>{birr(i.amount)}</span></div>)}</div>
          <div className="row between mt"><b>ጠቅላላ</b><b style={{ fontSize: 24, color: "var(--blue-700)" }}>{birr(t.amount)}</b></div>

          {t.status === "PENDING" && !rejecting && (
            <div className="row mt"><Button variant="success" size="big" className="grow" busy={busy} onClick={() => setConfirm("approve")}>አረጋግጥ</Button><Button variant="danger" size="big" className="grow" onClick={() => setRejecting(true)}>አልተቀበልኩም</Button></div>
          )}
          {t.status === "PENDING" && rejecting && (
            <div className="mt">
              <Field label="የውድቅ መሆን ምክንያት" hint="አባሉ ይህን ምክንያት ያያል።"><textarea className="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ምሳሌ፦ ምስሉ አይታይም / መጠኑ አይመሳሰልም" autoFocus /></Field>
              <div className="row mt-s"><Button variant="danger" busy={busy} onClick={reject}>ውድቅ አድርግ</Button><Button variant="ghost" onClick={() => setRejecting(false)}>ተወው</Button></div>
            </div>
          )}
          {t.status === "VERIFIED" && (
            <div className="row mt"><Button variant="secondary" onClick={() => startDownload(`/payments/${t.id}/confirmation`)}>የክፍያ ማረጋገጫ አውርድ</Button>{user?.role === "ADMIN" && <Button variant="danger" onClick={() => setConfirm("void")}>ክፍያውን ሰርዝ</Button>}</div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title"><h2>የክፍያ ማረጋገጫ ምስል</h2>{proof && <a className="small" href={`/api/payments/${t.id}/proof`} target="_blank" rel="noreferrer">በሙሉ ክፈት </a>}</div>
          {!proof ? <Empty>{t.method === "CASH" ? "በጥሬ ገንዘብ የተከፈለ ስለሆነ ምስል አያስፈልግም።" : "ምስል አልተያያዘም።"}</Empty> : isPdf
            ? <iframe title="ማረጋገጫ" src={`/api/payments/${t.id}/proof`} style={{ width: "100%", height: "70vh", border: "1px solid var(--gray-200)", borderRadius: 10 }} />
            : <a href={`/api/payments/${t.id}/proof`} target="_blank" rel="noreferrer"><img className="proof" src={`/api/payments/${t.id}/proof`} alt="የክፍያ ማረጋገጫ" /></a>}
        </div>
      </div>

      {confirm === "approve" && <ConfirmModal title="ክፍያውን ማረጋገጥ" text={<>የ«{t.full_name}» <b>{birr(t.amount)}</b> ({(t.items ?? []).length} ወራት) ተረጋግጦ ወራቱ «ተከፍሏል» ይሆናሉ።</>} confirmLabel="አረጋግጥ" onClose={() => setConfirm(null)} onConfirm={approve} />}
      {confirm === "void" && <VoidModal id={t.id} onClose={() => setConfirm(null)} onDone={() => { setConfirm(null); reload(); }} />}
    </>
  );
}

function VoidModal({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  return (
    <Modal title="ክፍያውን መሰረዝ" onClose={onClose}>
      <p className="muted">ወራቱ እንደገና «አልተከፈለም» ይሆናሉ። መዝገቡ ለኦዲት ይቀራል።</p>
      {err && <div className="notice error">{err}</div>}
      <Field label="የመሰረዝ ምክንያት"><textarea className="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
      <div className="row mt" style={{ justifyContent: "flex-end" }}><Button variant="ghost" onClick={onClose}>ተወው</Button>
        <Button variant="danger" busy={busy} onClick={async () => { setBusy(true); try { const r = await api.post(`/payments/${id}/void`, { reason }); toast(r.message); onDone(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } }}>ሰርዝ</Button></div>
    </Modal>
  );
}
