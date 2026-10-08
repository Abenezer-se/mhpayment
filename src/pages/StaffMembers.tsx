import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EtDate, formatInstant, formatPeriod, monthName } from "../../shared/calendar/ethiopian";
import { METHOD_LABEL } from "../../shared/labels";
import { api, prepareProof, startDownload } from "../api";
import { useAuth } from "../auth";
import {
  Button, birr, ConfirmModal, copyText, DownloadButtons, Empty, errMsg, EtDateInput, Field, Loading, Pager, PageHead, Select,
  StatusBadge, TxBadge, useData, useDebounced, useLookups, useMeta, useToast,
} from "../ui";
import { FilterPanel, Filters } from "./StaffFilters";
import { useBase } from "./StaffShell";

// ───────── የአባላት ዝርዝር ─────────
export function MembersPage() {
  const base = useBase();
  const [f, setF] = useState<Filters>({ active: "1" });
  const [page, setPage] = useState(1);
  const q = useDebounced(f.search);
  const params = { search: q, departmentId: f.departmentId, memberTypeId: f.memberTypeId, categoryId: f.categoryId, active: f.active, status: f.status };
  const { data, loading, error } = useData(() => api.get("/members", { ...params, page }), [JSON.stringify(params), page]);
  const set = (p: Partial<Filters>) => { setF((o) => ({ ...o, ...p })); setPage(1); };
  return (
    <>
      <PageHead title="የአባላት ዝርዝር">
        <DownloadButtons path="/members/export" params={params} labels={["ኤክሴል አውርድ", "ፒዲኤፍ አውርድ"]} />
        <Link to={`${base}/members/new`} className="btn">አዲስ አባል</Link>
      </PageHead>
      <FilterPanel f={f} set={set} show={{ dept: true, category: true, type: true, active: true, status: true }} onReset={() => { setF({ active: "1" }); setPage(1); }} />
      <div className="small muted mb">«ሁኔታ» የሚያመለክተው የአሁኑን ወር ክፍያ ነው።</div>
      {error && <div className="notice error">{error}</div>}
      {loading && !data ? <Loading /> : !data || data.rows.length === 0 ? <div className="panel"><Empty>ምንም አባል አልተገኘም።</Empty></div> : (
        <>
          <div className="table-wrap">
            <table className="t cards">
              <thead><tr><th>የአባል መለያ</th><th>ሙሉ ስም</th><th>ስልክ ቁጥር</th><th>ክፍል</th><th>የአባልነት አይነት</th><th>ምድብ</th><th>የዚህ ወር ክፍያ</th><th /></tr></thead>
              <tbody>
                {data.rows.map((m: any) => (
                  <tr key={m.id}>
                    <td data-label="የአባል መለያ" className="nowrap">{m.member_code}</td>
                    <td data-label="ሙሉ ስም"><Link to={`${base}/members/${m.id}`}><b>{m.full_name}</b></Link>{!m.is_active && <> <span className="badge off">ታግዷል</span></>}</td>
                    <td data-label="ስልክ ቁጥር" className="nowrap">0{m.phone.slice(4)}</td>
                    <td data-label="ክፍል">{m.department}</td><td data-label="የአባልነት አይነት">{m.member_type}</td><td data-label="ምድብ">{m.category}</td>
                    <td data-label="የዚህ ወር ክፍያ">{m.current_status ? <StatusBadge status={m.current_status} /> : <span className="muted">—</span>}</td>
                    <td data-label=""><Link to={`${base}/members/${m.id}`} className="btn secondary small">ክፍያ / ዝርዝር</Link></td>
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

// ───────── አዲስ አባል መመዝገቢያ / ማሻሻያ ─────────
function Credentials({ m, onAgain }: { m: { fullName: string; memberCode?: string; phoneDisplay: string; initialPassword: string }; onAgain?: () => void }) {
  const toast = useToast();
  const { meta } = useMeta();
  const text = `${meta?.orgName ?? ""}\nየመግቢያ መረጃ\nስም፦ ${m.fullName}\n${m.memberCode ? `የአባል መለያ፦ ${m.memberCode}\n` : ""}ስልክ ቁጥር፦ ${m.phoneDisplay}\nየመጀመሪያ የይለፍ ቃል፦ ${m.initialPassword}\nድረገጽ፦ ${location.origin}\nእባክዎ ከገቡ በኋላ የይለፍ ቃልዎን ይቀይሩ።`;
  return (
    <div className="panel">
      <div className="notice ok"><b>{m.memberCode ? "አባሉ በተሳካ ሁኔታ ተመዝግቧል።" : "አዲስ የይለፍ ቃል ተፈጥሯል።"}</b></div>
      <div className="cred">
        <div><span className="muted">ስም፦</span> <b style={{ fontSize: 17 }}>{m.fullName}</b></div>
        {m.memberCode && <div><span className="muted">የአባል መለያ፦</span> <b>{m.memberCode}</b></div>}
        <div><span className="muted">ስልክ ቁጥር (መግቢያ)፦</span> <b>{m.phoneDisplay}</b></div>
        <div><span className="muted">የመጀመሪያ የይለፍ ቃል፦</span> <b>{m.initialPassword}</b></div>
      </div>
      <div className="notice warn mt small">ይህ የመጀመሪያ (ጊዜያዊ) የይለፍ ቃል <b>አሁን ብቻ</b> ነው የሚታየው። ለአባሉ ይስጡት፤ አባሉ ሲገባ እንዲቀይር ይጠየቃል።</div>
      <div className="row"><Button variant="secondary" onClick={() => copyText(text, toast)}>የመግቢያ መረጃውን ቅዳ</Button>{onAgain && <Button onClick={onAgain}>ሌላ አባል መዝግብ</Button>}</div>
    </div>
  );
}

export function MemberFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const base = useBase();
  const nav = useNavigate();
  const toast = useToast();
  const { meta } = useMeta();
  const { data: lk } = useLookups();
  const existing = useData(() => (id ? api.get(`/members/${id}`) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState({ fullName: "", phone: "", memberTypeId: "", departmentId: "", categoryId: "" });
  const [date, setDate] = useState<EtDate | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [created, setCreated] = useState<any>(null);

  useEffect(() => { if (meta && !date && !editing) setDate(meta.today); }, [meta, date, editing]);
  useEffect(() => {
    const m = existing.data;
    if (m) setForm({ fullName: m.full_name, phone: m.phone_display, memberTypeId: String(m.member_type_id), departmentId: String(m.department_id), categoryId: String(m.category_id) });
  }, [existing.data]);

  const active = (l?: any[]) => (l ?? []).filter((x) => x.is_active || String(x.id) === form.memberTypeId || String(x.id) === form.departmentId || String(x.id) === form.categoryId).map((x) => ({ value: x.id, label: x.name }));
  const cat = lk?.categories.find((c) => String(c.id) === form.categoryId);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    if (!form.memberTypeId || !form.departmentId || !form.categoryId) return setError("የአባልነት አይነት፣ ክፍልና የክፍያ ምድብ ይምረጡ።");
    setBusy(true);
    const body = { fullName: form.fullName, phone: form.phone, memberTypeId: Number(form.memberTypeId), departmentId: Number(form.departmentId), categoryId: Number(form.categoryId), ...(editing ? {} : { registeredDate: date }) };
    try {
      if (editing) { const r = await api.put(`/members/${id}`, body); toast(r.message); nav(`${base}/members/${id}`); }
      else setCreated(await api.post("/members", body));
    } catch (err) { setError(errMsg(err)); window.scrollTo({ top: 0, behavior: "smooth" }); } finally { setBusy(false); }
  };

  if (created) return (<><PageHead title="አዲስ አባል መመዝገቢያ" /><Credentials m={created} onAgain={() => { setCreated(null); setForm({ fullName: "", phone: "", memberTypeId: form.memberTypeId, departmentId: form.departmentId, categoryId: form.categoryId }); }} /><div className="mt"><Link to={`${base}/members/${created.id}`}>ወደ አባሉ ገጽ ሂድ →</Link></div></>);
  if (editing && existing.loading) return <Loading />;
  if (!meta) return <Loading />;

  return (
    <>
      <PageHead title={editing ? "የአባል መረጃ ማሻሻያ" : "አዲስ አባል መመዝገቢያ"} />
      <form className="panel" onSubmit={submit} style={{ maxWidth: 820 }}>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="form-grid">
          <Field label="ሙሉ ስም"><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required autoFocus /></Field>
          <Field label="ስልክ ቁጥር" hint="የአባሉ የመግቢያ መለያ ይሆናል። ምሳሌ፦ 0911223344"><input className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></Field>
          <Field label="የአባልነት አይነት"><Select all="ይምረጡ" value={form.memberTypeId} onChange={(v) => setForm({ ...form, memberTypeId: v })} options={active(lk?.memberTypes)} /></Field>
          <Field label="የክፍል ስም"><Select all="ይምረጡ" value={form.departmentId} onChange={(v) => setForm({ ...form, departmentId: v })} options={active(lk?.departments)} /></Field>
          <Field label="የክፍያ ምድብ" hint={cat?.amount != null ? `ወርሃዊ ክፍያ፦ ${birr(cat.amount)}` : undefined}><Select all="ይምረጡ" value={form.categoryId} onChange={(v) => setForm({ ...form, categoryId: v })} options={active(lk?.categories)} /></Field>
          {!editing && <Field label="የመመዝገቢያ ቀን" hint="ክፍያ የሚጀምረው ከዚህ ወር ነው።"><EtDateInput value={date} onChange={setDate} startYear={meta.startYear} endYear={meta.currentPeriod.year} /></Field>}
        </div>
        {!editing && <div className="notice info small mt">ሲመዘገብ ሥርዓቱ በራስ-ሰር፦ የአባል መለያ ይሰጣል፣ የመግቢያ መለያና የመጀመሪያ የይለፍ ቃል ይፈጥራል፣ የወራት ክፍያዎችን ያዘጋጃል።</div>}
        <div className="row mt"><Button type="submit" size="big" busy={busy}>{editing ? "አስቀምጥ" : "መዝግብ"}</Button><Link to={editing ? `${base}/members/${id}` : `${base}/members`} className="btn ghost">ተወው</Link></div>
      </form>
    </>
  );
}

// ───────── የአባል ገጽ + ክፍያ መመዝገቢያ ─────────
export function MemberDetailPage() {
  const { id } = useParams();
  const base = useBase();
  const toast = useToast();
  const { meta } = useMeta();
  const { data: m, loading, error, reload } = useData(() => api.get(`/members/${id}`), [id]);
  const [year, setYear] = useState<number | null>(null);
  const y = year ?? meta?.currentPeriod.year ?? 0;
  const ob = useData(() => (y ? api.get(`/members/${id}/obligations`, { year: y }) : Promise.resolve({ rows: [] })), [id, y]);
  const hist = useData(() => api.get("/payments", { memberId: id, pageSize: 50 }), [id]);
  const [modal, setModal] = useState<null | "deactivate" | "activate" | "reset">(null);
  const [cred, setCred] = useState<any>(null);

  if (loading && !m) return <Loading />;
  if (error || !m) return <div className="notice error">{error}</div>;
  const years: number[] = []; if (meta) for (let i = meta.startYear; i <= meta.currentPeriod.year + 1; i++) years.push(i);

  return (
    <>
      <PageHead title={m.full_name}>
        <Link to={`${base}/members/${id}/edit`} className="btn secondary small">አርም</Link>
        <Button variant="secondary" size="small" onClick={() => setModal("reset")}>አዲስ የይለፍ ቃል</Button>
        {m.is_active ? <Button variant="danger" size="small" onClick={() => setModal("deactivate")}>አግድ</Button> : <Button variant="success" size="small" onClick={() => setModal("activate")}>መልስ</Button>}
      </PageHead>
      {cred && <Credentials m={{ fullName: m.full_name, phoneDisplay: cred.phone, initialPassword: cred.initialPassword }} />}
      <div className="panel">
        <dl className="info">
          <dt>የአባል መለያ</dt><dd>{m.member_code} {!m.is_active && <span className="badge off">ታግዷል</span>}</dd>
          <dt>ስልክ ቁጥር</dt><dd>{m.phone_display}</dd>
          <dt>ክፍል</dt><dd>{m.department}</dd><dt>የአባልነት አይነት</dt><dd>{m.member_type}</dd><dt>የክፍያ ምድብ</dt><dd>{m.category}</dd>
          <dt>የተመዘገበበት</dt><dd>{m.registered_day} {monthName(m.registered_month)} {m.registered_year} ዓ.ም.</dd>
          <dt>የመጨረሻ መግቢያ</dt><dd>{m.last_login_at ? formatInstant(m.last_login_at, true) : "ገና አልገባም"}</dd>
        </dl>
      </div>

      <div className="panel">
        <div className="panel-title"><h2>ክፍያ መመዝገብ</h2><div style={{ width: 150 }}><Select all={null} value={y} onChange={(v) => setYear(Number(v))} options={years.map((v) => ({ value: v, label: `${v} ዓ.ም.` }))} /></div></div>
        {ob.loading && !ob.data ? <Loading /> : <RecordPayment memberId={Number(id)} rows={ob.data?.rows ?? []} onDone={() => { ob.reload(); hist.reload(); }} active={m.is_active} />}
      </div>

      <div className="panel">
        <div className="panel-title"><h2>የአባሉ የክፍያ ታሪክ</h2></div>
        {!hist.data || hist.data.rows.length === 0 ? <Empty>እስካሁን ክፍያ የለም።</Empty> : (
          <div className="table-wrap"><table className="t cards">
            <thead><tr><th>የማረጋገጫ ቁጥር</th><th>ቀን</th><th>ወራት</th><th className="num">መጠን</th><th>ዘዴ</th><th>ሁኔታ</th><th /></tr></thead>
            <tbody>{hist.data.rows.map((t: any) => (
              <tr key={t.id}>
                <td data-label="የማረጋገጫ ቁጥር"><Link to={`${base}/payments/${t.id}`}>{t.reference_no}</Link></td>
                <td data-label="ቀን" className="nowrap">{formatInstant(t.paid_at, true)}</td>
                <td data-label="ወራት">{(t.items ?? []).map((i: any) => monthName(i.month)).join("፣ ")}</td>
                <td data-label="መጠን" className="num">{birr(t.amount)}</td><td data-label="ዘዴ">{METHOD_LABEL[t.method]}</td><td data-label="ሁኔታ"><TxBadge status={t.status} /></td>
                <td data-label="">{t.status === "VERIFIED" && <Button size="small" variant="secondary" onClick={() => startDownload(`/payments/${t.id}/confirmation`)}>ማረጋገጫ</Button>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>

      {modal === "deactivate" && <ConfirmModal danger title="አባሉን ማገድ" text={<>«{m.full_name}» ይታገዳል፤ መግባት አይችልም፤ ከሪፖርቶች «የሚከፈል» ውስጥም አይቆጠርም። የድሮ ክፍያዎቹ ይቀራሉ።</>} confirmLabel="አግድ" onClose={() => setModal(null)} onConfirm={async () => { const r = await api.post(`/members/${id}/deactivate`); toast(r.message); setModal(null); reload(); }} />}
      {modal === "activate" && <ConfirmModal title="አባሉን መመለስ" text={<>«{m.full_name}» ተመልሶ መግባት ይችላል።</>} confirmLabel="መልስ" onClose={() => setModal(null)} onConfirm={async () => { const r = await api.post(`/members/${id}/activate`); toast(r.message); setModal(null); reload(); }} />}
      {modal === "reset" && <ConfirmModal title="አዲስ የይለፍ ቃል መስጠት" text={<>ለ«{m.full_name}» አዲስ የመጀመሪያ የይለፍ ቃል ይፈጠራል። አሁን ያለው የይለፍ ቃል ከዚያ በኋላ አይሰራም።</>} confirmLabel="ፍጠር" onClose={() => setModal(null)} onConfirm={async () => { try { setCred(await api.post(`/members/${id}/reset-password`)); setModal(null); window.scrollTo({ top: 0 }); } catch (e) { toast(errMsg(e), "error"); } }} />}
    </>
  );
}

function RecordPayment({ memberId, rows, onDone, active }: { memberId: number; rows: any[]; onDone: () => void; active: boolean }) {
  const toast = useToast();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [method, setMethod] = useState<"CASH" | "MOBILE_BANKING">("CASH");
  const [file, setFile] = useState<File | null>(null), [amount, setAmount] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setSel(new Set()); }, [rows]);
  const open = rows.filter((r) => r.status === "UNPAID" || r.status === "REJECTED");
  const total = useMemo(() => open.filter((r) => sel.has(r.id)).reduce((s, r) => s + Number(r.amount), 0), [open, sel]);
  useEffect(() => { setAmount(total ? String(total) : ""); }, [total]);
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.set("memberId", String(memberId)); fd.set("method", method); fd.set("obligationIds", JSON.stringify([...sel]));
      if (amount) fd.set("amount", amount); if (note) fd.set("note", note);
      if (method === "MOBILE_BANKING" && file) fd.set("proof", await prepareProof(file));
      const r = await api.upload("/payments/record", fd);
      toast(`ክፍያው ተረጋግጧል። ${r.referenceNo}`); setFile(null); setNote(""); onDone();
    } catch (e) { setError(errMsg(e)); if ((e as any)?.status === 409) onDone(); } finally { setBusy(false); }
  };

  if (rows.length === 0) return <Empty>በዚህ ዓመት የሚከፈል ክፍያ የለም።</Empty>;
  return (
    <>
      {!active && <div className="notice warn small">ይህ አባል ታግዷል።</div>}
      <div className="table-wrap"><table className="t">
        <thead><tr><th style={{ width: 44 }}>
          <input type="checkbox" aria-label="ሁሉንም ምረጥ" checked={open.length > 0 && open.every((r) => sel.has(r.id))} disabled={!open.length} onChange={(e) => setSel(e.target.checked ? new Set(open.map((r) => r.id)) : new Set())} />
        </th><th>ወር</th><th className="num">የሚከፈል</th><th>ሁኔታ</th><th>ዝርዝር</th></tr></thead>
        <tbody>{rows.map((r) => {
          const ok = r.status === "UNPAID" || r.status === "REJECTED";
          return (
            <tr key={r.id} style={sel.has(r.id) ? { background: "var(--blue-50)" } : undefined}>
              <td><input type="checkbox" disabled={!ok} checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={monthName(r.ethiopian_month)} /></td>
              <td><b>{monthName(r.ethiopian_month)}</b></td><td className="num">{birr(r.amount)}</td><td><StatusBadge status={r.status} /></td>
              <td className="small muted">{r.status === "PAID" && r.paid_at ? `${formatInstant(r.paid_at)} • ${METHOD_LABEL[r.method] ?? ""}` : r.status === "PENDING" && r.transaction_id ? "ማረጋገጫ ይጠብቃል" : r.status === "REJECTED" ? r.reject_reason : ""}</td>
            </tr>);
        })}</tbody>
      </table></div>

      <div className="mt">
        <div className="label mb" style={{ marginBottom: 6 }}>የክፍያ ዘዴ</div>
        <div className="radio-cards">
          {(["CASH", "MOBILE_BANKING"] as const).map((k) => <label key={k} className={`radio-card ${method === k ? "on" : ""}`}><input type="radio" name="method" checked={method === k} onChange={() => setMethod(k)} />{METHOD_LABEL[k]}</label>)}
        </div>
        {method === "MOBILE_BANKING" && (
          <div className="form-grid mt">
            <Field label="የተላከው መጠን (ብር)" hint="ከተመረጡት ወራት ድምር ጋር መመሳሰል አለበት።"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="የክፍያ ማረጋገጫ ምስል (አማራጭ)">
              <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>{file ? `${file.name}` : "ምስል ምረጥ"}</Button>
            </Field>
          </div>
        )}
        <Field label="ማስታወሻ (አማራጭ)" className="mt-s"><input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      {error && <div className="notice error mt" role="alert">{error}</div>}
      <div className="row between mt">
        <div><span className="muted">የተመረጠ፦ {sel.size} ወራት</span><div style={{ fontSize: 20, fontWeight: 800, color: "var(--blue-700)" }}>ጠቅላላ፦ {birr(total)}</div></div>
        <Button variant="success" size="big" disabled={sel.size === 0} busy={busy} onClick={submit}>{method === "CASH" ? "በጥሬ ገንዘብ ተከፍሏል — ክፍያውን አረጋግጥ" : "ክፍያውን አረጋግጥ"}</Button>
      </div>
    </>
  );
}
void formatPeriod; void ConfirmModal;
