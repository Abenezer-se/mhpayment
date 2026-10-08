import { FormEvent, useRef, useState } from "react";
import { formatInstant, formatPeriod } from "../../shared/calendar/ethiopian";
import { ETHIOPIAN_MONTHS } from "../../shared/calendar/ethiopian";
import { AUDIT_LABEL } from "../../shared/labels";
import { api } from "../api";
import {
  Button, birr, ConfirmModal, copyText, Empty, errMsg, Field, Loading, Logo, Modal, PageHead, Pager, Select, useData, useLookups, useMeta, useToast, Lookup, useDebounced,
} from "../ui";

// ───────── ቅንብር ─────────
export function SettingsPage() {
  const [tab, setTab] = useState<"prices" | "departments" | "member-types" | "org">("prices");
  const tabs = [["prices", "የክፍያ ቅንብር"], ["departments", "ክፍሎች"], ["member-types", "የአባልነት አይነቶች"], ["org", "የድርጅት መረጃ"]] as const;
  return (
    <>
      <PageHead title="ቅንብር" />
      <div className="seg mb">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "prices" && <PricesTab />}
      {tab === "departments" && <LookupTab kind="departments" title="ክፍሎች" noun="ክፍል" />}
      {tab === "member-types" && <LookupTab kind="member-types" title="የአባልነት አይነቶች" noun="የአባልነት አይነት" />}
      {tab === "org" && <OrgTab />}
    </>
  );
}

function PricesTab() {
  const { data: lk, reload } = useLookups();
  const { meta } = useMeta();
  const toast = useToast();
  const [edit, setEdit] = useState<Lookup | null>(null);
  const [hist, setHist] = useState<Lookup | null>(null);
  const [adding, setAdding] = useState(false);
  const [rename, setRename] = useState<Lookup | null>(null);
  if (!lk || !meta) return <Loading />;
  return (
    <>
      <div className="notice info small">የክፍያ መጠን መቀየር ያለፉ ክፍያዎችን አይነካም። አዲሱ መጠን የሚተገበረው ከመረጡት ወር ጀምሮ ላሉ፣ ገና ላልተከፈሉ ወራት ብቻ ነው።</div>
      <div className="panel">
        <div className="panel-title"><h2>የክፍያ ምድቦች</h2><Button size="small" onClick={() => setAdding(true)}>አዲስ ምድብ</Button></div>
        <div className="table-wrap"><table className="t cards">
          <thead><tr><th>የክፍያ ምድብ</th><th className="num">የአሁኑ ወርሃዊ ክፍያ</th><th className="num">አባላት</th><th>ሁኔታ</th><th /></tr></thead>
          <tbody>{lk.categories.map((c) => (
            <tr key={c.id}>
              <td data-label="ምድብ"><b>{c.name}</b></td><td data-label="የአሁኑ ክፍያ" className="num"><b>{c.amount != null ? birr(c.amount) : "—"}</b></td><td data-label="አባላት" className="num">{c.members}</td>
              <td data-label="ሁኔታ">{c.is_active ? <span className="badge PAID">ንቁ</span> : <span className="badge off">ታግዷል</span>}</td>
              <td data-label="" className="right nowrap">
                <Button size="small" onClick={() => setEdit(c)}>መጠን ቀይር</Button>{" "}
                <Button size="small" variant="secondary" onClick={() => setHist(c)}>ታሪክ</Button>{" "}
                <Button size="small" variant="ghost" onClick={() => setRename(c)}>ስም / ሁኔታ</Button>
              </td>
            </tr>))}</tbody>
        </table></div>
      </div>
      {edit && <PriceModal cat={edit} onClose={() => setEdit(null)} onDone={(m) => { toast(m); setEdit(null); reload(); }} />}
      {hist && <HistoryModal cat={hist} onClose={() => setHist(null)} />}
      {adding && <NameModal title="አዲስ የክፍያ ምድብ" kind="categories" withAmount onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {rename && <NameModal title="ምድብ ማሻሻያ" kind="categories" item={rename} onClose={() => setRename(null)} onDone={() => { setRename(null); reload(); }} />}
    </>
  );
}

function PriceModal({ cat, onClose, onDone }: { cat: Lookup; onClose: () => void; onDone: (m: string) => void }) {
  const { meta } = useMeta();
  const [amount, setAmount] = useState(String(cat.amount ?? "")), [month, setMonth] = useState(meta!.currentPeriod.month), [year, setYear] = useState(meta!.currentPeriod.year);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const years = [meta!.currentPeriod.year, meta!.currentPeriod.year + 1];
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await api.post(`/config/categories/${cat.id}/price`, { amount: Number(amount), effectiveYear: year, effectiveMonth: month }); onDone(r.message); }
    catch (er) { setErr(errMsg(er)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${cat.name} — የክፍያ መጠን መቀየር`} onClose={onClose}>
      <form onSubmit={submit}>
        {err && <div className="notice error">{err}</div>}
        <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <Field label="አዲስ ወርሃዊ መጠን (ብር)"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus /></Field>
          <Field label="የሚጀምርበት ወር" hint="ከዚህ ወር በፊት ያሉ ወራት አይቀየሩም።">
            <div className="et-date" style={{ gridTemplateColumns: "1fr 1.5fr" }}>
              <Select all={null} value={year} onChange={(v) => setYear(Number(v))} options={years.map((y) => ({ value: y, label: String(y) }))} />
              <Select all={null} value={month} onChange={(v) => setMonth(Number(v))} options={ETHIOPIAN_MONTHS.map((m, i) => ({ value: i + 1, label: m }))} />
            </div>
          </Field>
        </div>
        <div className="row mt" style={{ justifyContent: "flex-end" }}><Button variant="ghost" onClick={onClose}>ተወው</Button><Button type="submit" busy={busy}>አስቀምጥ</Button></div>
      </form>
    </Modal>
  );
}

function HistoryModal({ cat, onClose }: { cat: Lookup; onClose: () => void }) {
  const { data, loading } = useData(() => api.get(`/config/categories/${cat.id}/prices`), [cat.id]);
  return (
    <Modal title={`${cat.name} — የክፍያ መጠን ታሪክ`} onClose={onClose}>
      {loading ? <Loading /> : <div className="table-wrap"><table className="t"><thead><tr><th>ከ</th><th className="num">መጠን</th><th>የቀየረው</th></tr></thead>
        <tbody>{data?.rows.map((r: any) => <tr key={r.id}><td>{formatPeriod(r.effective_year, r.effective_month)}</td><td className="num"><b>{birr(r.amount)}</b></td><td className="small muted">{r.created_by ?? "ሥርዓት"}<br />{formatInstant(r.created_at)}</td></tr>)}</tbody></table></div>}
      <div className="row mt" style={{ justifyContent: "flex-end" }}><Button variant="ghost" onClick={onClose}>ዝጋ</Button></div>
    </Modal>
  );
}

function NameModal({ title, kind, item, withAmount, onClose, onDone }: { title: string; kind: string; item?: Lookup; withAmount?: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? ""), [amount, setAmount] = useState(""), [active, setActive] = useState(item?.is_active ?? true);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [del, setDel] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = item ? await api.put(`/config/${kind}/${item.id}`, { name, isActive: active }) : await api.post(`/config/${kind}`, { name, ...(withAmount ? { amount: Number(amount) } : {}) });
      toast(r.message); onDone();
    } catch (er) { setErr(errMsg(er)); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        {err && <div className="notice error">{err}</div>}
        <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <Field label="ስም"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          {withAmount && !item && <Field label="ወርሃዊ ክፍያ (ብር)"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>}
          {item && <label className="row" style={{ cursor: "pointer" }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 20, height: 20 }} /> ንቁ (በአዲስ ምዝገባ ላይ ይታያል)</label>}
        </div>
        <div className="row mt between">
          {item ? <Button variant="danger" size="small" onClick={() => setDel(true)}>ሰርዝ</Button> : <span />}
          <div className="row"><Button variant="ghost" onClick={onClose}>ተወው</Button><Button type="submit" busy={busy}>አስቀምጥ</Button></div>
        </div>
      </form>
      {del && item && <ConfirmModal danger title="መሰረዝ" text={<>«{item.name}» ይሰረዛል። በአገልግሎት ላይ ከሆነ መሰረዝ አይቻልም — በምትኩ ያሰናክሉት።</>} confirmLabel="ሰርዝ" onClose={() => setDel(false)}
        onConfirm={async () => { try { const r = await api.del(`/config/${kind}/${item.id}`); toast(r.message); onDone(); } catch (e) { toast(errMsg(e), "error"); setDel(false); } }} />}
    </Modal>
  );
}

function LookupTab({ kind, title, noun }: { kind: "departments" | "member-types"; title: string; noun: string }) {
  const { data: lk, reload } = useLookups();
  const [adding, setAdding] = useState(false), [edit, setEdit] = useState<Lookup | null>(null);
  if (!lk) return <Loading />;
  const list = kind === "departments" ? lk.departments : lk.memberTypes;
  return (
    <div className="panel">
      <div className="panel-title"><h2>{title}</h2><Button size="small" onClick={() => setAdding(true)}>አዲስ</Button></div>
      {list.length === 0 ? <Empty /> : <div className="table-wrap"><table className="t cards"><thead><tr><th>ስም</th><th className="num">አባላት</th><th>ሁኔታ</th><th /></tr></thead>
        <tbody>{list.map((l) => <tr key={l.id}><td data-label="ስም"><b>{l.name}</b></td><td data-label="አባላት" className="num">{l.members}</td><td data-label="ሁኔታ">{l.is_active ? <span className="badge PAID">ንቁ</span> : <span className="badge off">ታግዷል</span>}</td><td data-label="" className="right"><Button size="small" variant="secondary" onClick={() => setEdit(l)}>አርም</Button></td></tr>)}</tbody></table></div>}
      {adding && <NameModal title={`አዲስ ${noun}`} kind={kind} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {edit && <NameModal title={`${noun} ማሻሻያ`} kind={kind} item={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function OrgTab() {
  const toast = useToast();
  const { reload: reloadMeta } = useMeta();
  const { data, loading, reload } = useData(() => api.get("/config/settings"), []);
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  if (loading && !data) return <Loading />;
  const form = f ?? data;
  if (!form) return null;
  const set = (p: any) => setF({ ...form, ...p });
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await api.put("/config/settings", { orgName: form.orgName, orgParent: form.orgParent ?? "", orgPhone: form.orgPhone, orgEmail: form.orgEmail, orgAddress: form.orgAddress, orgDescription: form.orgDescription, billPagumen: !!form.billPagumen }); toast(r.message); reloadMeta(); reload(); }
    catch (er) { setErr(errMsg(er)); } finally { setBusy(false); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    const fd = new FormData(); fd.set("logo", file);
    try { const r = await api.upload("/config/settings/logo", fd); toast(r.message); reloadMeta(); } catch (er) { toast(errMsg(er), "error"); }
  };
  return (
    <>
      <div className="panel">
        <div className="panel-title"><h2>አርማ</h2></div>
        <div className="row"><Logo size={72} /><input ref={fileRef} type="file" hidden accept="image/png,image/jpeg" onChange={(e) => upload(e.target.files?.[0])} /><Button variant="secondary" onClick={() => fileRef.current?.click()}>አርማ ቀይር</Button><span className="small muted">PNG ወይም JPG፣ ከ2 ሜጋባይት በታች። በመግቢያ ገጽ፣ በዳሽቦርዶች፣ በPDF፣ በExcel እና በክፍያ ማረጋገጫ ላይ ይታያል።</span></div>
      </div>
      <form className="panel" onSubmit={save}>
        <div className="panel-title"><h2>የድርጅት መረጃ</h2></div>
        {err && <div className="notice error">{err}</div>}
        <div className="form-grid">
          <Field label="የካቴድራል ስም" hint="በሪፖርቶች ራስጌ ላይ ከትምህርት ቤቱ ስም በላይ ይታያል።"><input className="input" value={form.orgParent ?? ""} onChange={(e) => set({ orgParent: e.target.value })} /></Field>
          <Field label="የድርጅቱ ስም"><input className="input" value={form.orgName} onChange={(e) => set({ orgName: e.target.value })} required /></Field>
          <Field label="ስልክ"><input className="input" value={form.orgPhone} onChange={(e) => set({ orgPhone: e.target.value })} /></Field>
          <Field label="ኢሜይል"><input className="input" type="email" value={form.orgEmail} onChange={(e) => set({ orgEmail: e.target.value })} /></Field>
          <Field label="አድራሻ"><input className="input" value={form.orgAddress} onChange={(e) => set({ orgAddress: e.target.value })} /></Field>
          <Field label="ተጨማሪ መግለጫ" className="wide"><input className="input" value={form.orgDescription} onChange={(e) => set({ orgDescription: e.target.value })} /></Field>
        </div>
        <label className="row mt" style={{ cursor: "pointer" }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={!!form.billPagumen} onChange={(e) => set({ billPagumen: e.target.checked })} /> ጳጉሜንም እንደ ክፍያ ወር ይቆጠር (በነባሪ አይቆጠርም)</label>
        <div className="mt"><Button type="submit" busy={busy}>አስቀምጥ</Button></div>
      </form>
    </>
  );
}

// ───────── የገንዘብ ያዦች ─────────
export function StaffAdminsPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useData(() => api.get("/staff"), []);
  const [adding, setAdding] = useState(false), [edit, setEdit] = useState<any>(null), [reset, setReset] = useState<any>(null), [cred, setCred] = useState<any>(null);
  return (
    <>
      <PageHead title="የገንዘብ ያዦች"><Button onClick={() => setAdding(true)}>አዲስ የገንዘብ ያዥ</Button></PageHead>
      {cred && (
        <div className="panel mb"><div className="notice ok"><b>{cred.message}</b></div>
          <div className="cred"><div><span className="muted">ስም፦</span> <b style={{ fontSize: 17 }}>{cred.fullName}</b></div><div><span className="muted">ስልክ ቁጥር፦</span> <b>0{cred.phone.slice(4)}</b></div><div><span className="muted">የመጀመሪያ የይለፍ ቃል፦</span> <b>{cred.initialPassword}</b></div></div>
          <div className="notice warn mt small">ይህ የይለፍ ቃል አሁን ብቻ ነው የሚታየው። ሲገቡ እንዲቀይሩ ይጠየቃሉ። መግቢያቸው፦ <b>{location.origin}/finance</b></div>
          <div className="row"><Button variant="secondary" onClick={() => copyText(`ስልክ፦ 0${cred.phone.slice(4)}\nየይለፍ ቃል፦ ${cred.initialPassword}\nመግቢያ፦ ${location.origin}/finance`, toast)}>ቅዳ</Button><Button variant="ghost" onClick={() => setCred(null)}>ዝጋ</Button></div></div>
      )}
      {error && <div className="notice error">{error}</div>}
      {loading && !data ? <Loading /> : !data || data.rows.length === 0 ? <div className="panel"><Empty>እስካሁን የገንዘብ ያዥ አልተፈጠረም።</Empty></div> : (
        <div className="table-wrap"><table className="t cards"><thead><tr><th>ስም</th><th>ስልክ ቁጥር</th><th>የመጨረሻ መግቢያ</th><th>ሁኔታ</th><th /></tr></thead>
          <tbody>{data.rows.map((u: any) => (
            <tr key={u.id}><td data-label="ስም"><b>{u.full_name}</b></td><td data-label="ስልክ ቁጥር">0{u.phone.slice(4)}</td><td data-label="የመጨረሻ መግቢያ">{u.last_login_at ? formatInstant(u.last_login_at, true) : "ገና አልገባም"}</td>
              <td data-label="ሁኔታ">{u.is_active ? <span className="badge PAID">ንቁ</span> : <span className="badge off">ታግዷል</span>}</td>
              <td data-label="" className="right nowrap"><Button size="small" variant="secondary" onClick={() => setEdit(u)}>አርም</Button> <Button size="small" variant="ghost" onClick={() => setReset(u)}>አዲስ የይለፍ ቃል</Button></td></tr>))}</tbody></table></div>
      )}
      {adding && <StaffModal onClose={() => setAdding(false)} onDone={(r) => { setAdding(false); setCred(r); reload(); }} />}
      {edit && <StaffModal user={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
      {reset && <ConfirmModal title="አዲስ የይለፍ ቃል" text={<>ለ«{reset.full_name}» አዲስ የመጀመሪያ የይለፍ ቃል ይፈጠራል።</>} confirmLabel="ፍጠር" onClose={() => setReset(null)}
        onConfirm={async () => { try { const r = await api.post(`/staff/${reset.id}/reset-password`); setCred({ ...r, fullName: reset.full_name, phone: reset.phone }); setReset(null); } catch (e) { toast(errMsg(e), "error"); } }} />}
    </>
  );
}

function StaffModal({ user, onClose, onDone }: { user?: any; onClose: () => void; onDone: (r: any) => void }) {
  const [name, setName] = useState(user?.full_name ?? ""), [phone, setPhone] = useState(user ? `0${user.phone.slice(4)}` : ""), [active, setActive] = useState(user?.is_active ?? true);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { onDone(user ? await api.put(`/staff/${user.id}`, { fullName: name, phone, isActive: active }) : await api.post("/staff", { fullName: name, phone })); }
    catch (er) { setErr(errMsg(er)); } finally { setBusy(false); }
  };
  return (
    <Modal title={user ? "የገንዘብ ያዥ ማሻሻያ" : "አዲስ የገንዘብ ያዥ"} onClose={onClose}>
      <form onSubmit={submit}>
        {err && <div className="notice error">{err}</div>}
        <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <Field label="ሙሉ ስም"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          <Field label="ስልክ ቁጥር"><input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></Field>
          {user && <label className="row" style={{ cursor: "pointer" }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={active} onChange={(e) => setActive(e.target.checked)} /> ንቁ (ሲታገድ መግባት አይችልም)</label>}
        </div>
        <div className="row mt" style={{ justifyContent: "flex-end" }}><Button variant="ghost" onClick={onClose}>ተወው</Button><Button type="submit" busy={busy}>{user ? "አስቀምጥ" : "ፍጠር"}</Button></div>
      </form>
    </Modal>
  );
}

// ───────── የተግባር ታሪክ ─────────
function summarize(a: any): string {
  const d = a.details ?? {};
  const bits: string[] = [];
  if (d.name) bits.push(d.name);
  if (d.memberCode) bits.push(d.memberCode);
  if (d.ref) bits.push(d.ref);
  if (d.amount !== undefined && a.action !== "PRICE_CHANGED") bits.push(birr(d.amount));
  if (a.action === "PRICE_CHANGED") bits.push(`${d.from ?? "—"} → ${d.to} ብር (ከ ${d.effective})`);
  if (d.reason) bits.push(`ምክንያት፦ ${d.reason}`);
  return bits.join(" • ");
}
export function AuditPage() {
  const [page, setPage] = useState(1), [action, setAction] = useState(""), [search, setSearch] = useState("");
  const q = useDebounced(search);
  const { data, loading, error } = useData(() => api.get("/audit", { page, action, search: q }), [page, action, q]);
  return (
    <>
      <PageHead title="የተግባር ታሪክ" />
      <div className="panel mb"><div className="filters">
        <Field label="ፍለጋ"><input className="input" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="የተጠቃሚ ስም ወይም ዝርዝር" /></Field>
        <Field label="ተግባር"><Select value={action} onChange={(v) => { setAction(v); setPage(1); }} options={Object.entries(AUDIT_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
      </div></div>
      {error && <div className="notice error">{error}</div>}
      {loading && !data ? <Loading /> : !data || data.rows.length === 0 ? <div className="panel"><Empty /></div> : (
        <><div className="table-wrap"><table className="t cards"><thead><tr><th>ቀን</th><th>ተጠቃሚ</th><th>ተግባር</th><th>ዝርዝር</th></tr></thead>
          <tbody>{data.rows.map((a: any) => <tr key={a.id}><td data-label="ቀን" className="nowrap">{formatInstant(a.created_at, true)}</td><td data-label="ተጠቃሚ">{a.user_name ?? "ሥርዓት"}</td><td data-label="ተግባር"><b>{AUDIT_LABEL[a.action] ?? a.action}</b></td><td data-label="ዝርዝር" className="small">{summarize(a)}</td></tr>)}</tbody></table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} /></>
      )}
    </>
  );
}
