import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { formatInstant, formatPeriod, monthName } from "../../shared/calendar/ethiopian";
import { METHOD_LABEL } from "../../shared/labels";
import { api, prepareProof, startDownload } from "../api";
import { useAuth } from "../auth";
import { Icon, IconName } from "../icons";
import { ThemeToggle } from "../theme";
import { Button, birr, Empty, errMsg, Loading, Logo, Modal, Pager, Select, StatusBadge, TxBadge, useData, useMeta } from "../ui";
import { ChangePasswordForm } from "./Auth";

const isOpen = (r: { status: string }) => r.status === "UNPAID" || r.status === "REJECTED";

function MemberShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { meta } = useMeta();
  const links: [string, string, IconName][] = [["/", "የእኔ ክፍያ", "home"], ["/pay", "ክፍያ ይፈጽሙ", "card"], ["/history", "የክፍያ ታሪክ", "receipt"], ["/password", "የይለፍ ቃል", "key"]];
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand grow"><Logo /><span>{meta?.orgName}</span></div>
          <div className="user-chip"><b>{user?.fullName}</b><div>{user?.memberCode}</div></div>
          <ThemeToggle />
          <Button variant="ghost" size="small" onClick={logout}>ውጣ</Button>
        </div>
      </header>
      <nav className="nav member-nav"><div className="nav-inner">{links.map(([to, label]) => <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>)}</div></nav>
      <main className="container">{children}</main>
      <nav className="tabbar" aria-label="ዋና ምናሌ">{links.map(([to, label, ic]) => <NavLink key={to} to={to} end={to === "/"}><Icon name={ic} />{label}</NavLink>)}</nav>
    </>
  );
}

export function MemberApp() {
  return (
    <MemberShell>
      <Routes>
        <Route index element={<MemberDashboard />} />
        <Route path="pay" element={<PayPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="password" element={<><div className="page-head"><h1>የይለፍ ቃሌን ቀይር</h1></div><div className="panel"><ChangePasswordForm /></div></>} />
        <Route path="*" element={<MemberDashboard />} />
      </Routes>
    </MemberShell>
  );
}

function YearSelect({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const { meta } = useMeta();
  if (!meta) return null;
  const years: number[] = []; for (let y = meta.startYear; y <= meta.currentPeriod.year + 1; y++) years.push(y);
  return <div style={{ minWidth: 150 }}><Select all={null} value={year} onChange={(v) => onChange(Number(v))} options={years.map((y) => ({ value: y, label: `${y} ዓ.ም.` }))} /></div>;
}

// ───────── የእኔ ክፍያ ─────────
function MemberDashboard() {
  const { meta } = useMeta();
  const [year, setYear] = useState<number | null>(null);
  const y = year ?? meta?.currentPeriod.year ?? 0;
  const { data, loading, error } = useData(() => api.get("/me/dashboard", { year: y || undefined }), [y]);
  const all = useData(() => api.get("/me/years"), []);
  if (!meta || (loading && !data)) return <Loading />;
  if (error || !data) return <div className="notice error">{error}</div>;
  const isCurYear = data.year === data.current.year;
  const tm = data.thisMonth;
  const past = (all.data?.rows ?? []).filter((r: any) => r.ethiopian_year < data.current.year && isOpen(r));
  const pastTotal = past.reduce((s: number, r: any) => s + Number(r.amount), 0);
  return (
    <>
      <div className="page-head"><h1>የእኔ ክፍያ</h1><YearSelect year={data.year} onChange={setYear} /></div>

      {past.length > 0 && (
        <div className="notice warn">
          <b>ከቀደሙት ዓመታት ያልተከፈለ ክፍያ አለዎት።</b>
          <div className="small mt-s">{past.length} ወራት • ጠቅላላ {birr(pastTotal)}። አሁንም መክፈል ይችላሉ።</div>
          <div className="mt-s"><Link to="/pay" className="btn small">ያልተከፈለውን ይመልከቱ</Link></div>
        </div>
      )}

      {data.rejected.length > 0 && (
        <div className="notice error">
          <b>የክፍያ ማረጋገጫዎ አልተቀበለም።</b>
          {data.rejected.map((r: any) => <div key={r.id} className="small mt-s">ምክንያት፦ {r.reject_reason} <span className="muted">({r.reference_no})</span></div>)}
          <div className="mt-s"><Link to="/pay" className="btn small">እንደገና ያስገቡ</Link></div>
        </div>
      )}

      {isCurYear && (
        <div className="m-hero">
          <div className="between row"><span className="muted">የ{monthName(data.current.month)} ወር ክፍያ</span>{tm ? <StatusBadge status={tm.status} /> : <span className="muted small">አይመለከትዎትም</span>}</div>
          <div className="big">{tm ? birr(tm.amount) : "—"}</div>
          {tm && isOpen(tm) && <Link to="/pay" className="btn big block mt">ክፍያ ይፈጽሙ</Link>}
          {tm?.status === "PENDING" && <div className="small muted mt-s">የክፍያ ማረጋገጫዎ በገንዘብ ያዡ እየታየ ነው።</div>}
          {tm?.status === "PAID" && <div className="small mt-s" style={{ color: "var(--ok)" }}>ይህ ወር ተከፍሏል። እናመሰግናለን።</div>}
          <div className="kv">
            <div><div className="v" style={{ color: "var(--ok)" }}>{data.counts.paid}</div><div className="k">የተከፈለ</div></div>
            <div><div className="v" style={{ color: "var(--neutral)" }}>{data.counts.unpaid}</div><div className="k">ያልተከፈለ</div></div>
            <div><div className="v" style={{ color: "var(--warn)" }}>{data.counts.pending}</div><div className="k">በማረጋገጥ ላይ</div></div>
          </div>
        </div>
      )}

      <div className="panel mt">
        <div className="panel-title"><h2>የ{data.year} ዓ.ም. አጠቃላይ ሁኔታ</h2></div>
        <div className="kv" style={{ marginTop: 0 }}>
          <div><div className="v" style={{ color: "var(--ok)" }}>{birr(data.totals.paid)}</div><div className="k">የተከፈለ</div></div>
          <div><div className="v">{birr(data.totals.expected)}</div><div className="k">የሚከፈል</div></div>
          <div><div className="v" style={{ color: "var(--bad)" }}>{birr(data.totals.unpaid)}</div><div className="k">ያልተከፈለ</div></div>
        </div>
        {data.totals.pending > 0 && <div className="small muted mt-s">በማረጋገጥ ላይ ያለ፦ {birr(data.totals.pending)}</div>}
      </div>

      <div className="panel mt">
        <div className="panel-title"><h2>ወራት</h2></div>
        {data.rows.length === 0 ? <Empty>በዚህ ዓመት የሚከፈል ክፍያ የለም።</Empty> : (
          <div className="month-list">
            {data.rows.map((r: any) => (
              <div key={r.id} className="month-row">
                <div className="grow"><b>{monthName(r.ethiopian_month)}</b>
                  {r.status === "REJECTED" && r.reject_reason && <div className="small" style={{ color: "var(--bad)" }}>ምክንያት፦ {r.reject_reason}</div>}
                  {r.status === "PAID" && r.paid_at && <div className="small muted">{formatInstant(r.paid_at)} • {METHOD_LABEL[r.method]}</div>}
                </div>
                <div className="nowrap">{birr(r.amount)}</div><StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ───────── ክፍያ ይፈጽሙ (all years: current, next, and unpaid bills of past years) ─────────
function PayPage() {
  const nav = useNavigate();
  const { data, loading, error, reload } = useData(() => api.get("/me/years"), []);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [closed, setClosed] = useState<Record<number, boolean>>({});
  const [step, setStep] = useState<"pick" | "proof" | "done">("pick");
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!file || !file.type.startsWith("image/")) return setPreview(null); const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);

  const rows: any[] = data?.rows ?? [];
  const cur: number = data?.current.year ?? 0;
  const byYear = useMemo(() => { const m = new Map<number, any[]>(); for (const r of rows) m.set(r.ethiopian_year, [...(m.get(r.ethiopian_year) ?? []), r]); return m; }, [rows]);
  // current year first, then next year(s), then past years (most recent first)
  const years = useMemo(() => {
    const ys = [...byYear.keys()];
    return [...ys.filter((y) => y === cur), ...ys.filter((y) => y > cur).sort((a, b) => a - b), ...ys.filter((y) => y < cur).sort((a, b) => b - a)];
  }, [byYear, cur]);
  const open = rows.filter(isOpen);
  const pastOpen = open.filter((r) => r.ethiopian_year < cur);
  const total = useMemo(() => open.filter((r) => sel.has(r.id)).reduce((s, r) => s + Number(r.amount), 0), [open, sel]);
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleMany = (list: any[]) => setSel((s) => { const n = new Set(s); const all = list.every((r) => n.has(r.id)); list.forEach((r) => (all ? n.delete(r.id) : n.add(r.id))); return n; });
  const isClosed = (y: number) => closed[y] ?? (y !== cur && !(byYear.get(y) ?? []).some(isOpen));

  const submit = async () => {
    if (!file) return setErr("የክፍያ ማረጋገጫ ምስሉ አልተጫነም።");
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.set("obligationIds", JSON.stringify([...sel]));
      fd.set("proof", await prepareProof(file));
      await api.upload("/me/payments", fd);
      setStep("done");
    } catch (e) { setErr(errMsg(e)); if ((e as any)?.status === 409) { reload(); setStep("pick"); setSel(new Set()); } } finally { setBusy(false); }
  };

  if (loading && !data) return <Loading />;
  if (error) return <div className="notice error">{error}</div>;

  if (step === "done") return (
    <div className="panel" style={{ textAlign: "center", padding: 28 }}>
      <div className="done-mark"><Icon name="check" /></div>
      <h1>የክፍያ ማረጋገጫዎ ገብቷል</h1>
      <p className="muted">የገንዘብ ያዡ ካረጋገጠ በኋላ ወራቱ «ተከፍሏል» ይሆናሉ። ሁኔታውን በ«የክፍያ ታሪክ» ማየት ይችላሉ።</p>
      <div className="row mt" style={{ justifyContent: "center" }}><Button onClick={() => nav("/history")}>የክፍያ ታሪክ</Button><Button variant="secondary" onClick={() => nav("/")}>ወደ ዋና ገጽ</Button></div>
    </div>
  );

  return (
    <>
      <div className="page-head"><h1>ክፍያ ይፈጽሙ</h1></div>
      {step === "pick" && (
        <>
          <div className="notice info small">መክፈል የሚፈልጉትን ወራት ይምረጡ፤ አንድ ወር፣ ብዙ ወራት ወይም ሙሉ ዓመት መክፈል ይችላሉ። ዓመቱ ሲያልቅ ቀጣዩ ዓመት በራሱ ይታያል፤ ያልተከፈሉ የቀደሙ ዓመታት ክፍያዎችም እዚሁ ይቆያሉ። ክፍያውን በሞባይል ባንክ ካስተላለፉ በኋላ የደረሰኙን ምስል በሚቀጥለው ደረጃ ያስገባሉ።</div>

          {pastOpen.length > 0 && (
            <div className="notice warn">
              <div className="row between"><div><b>ከቀደሙት ዓመታት ያልተከፈለ ክፍያ አለዎት</b><div className="small">{pastOpen.length} ወራት • {birr(pastOpen.reduce((s, r) => s + Number(r.amount), 0))}</div></div>
                <Button variant="secondary" size="small" onClick={() => toggleMany(pastOpen)}>{pastOpen.every((r) => sel.has(r.id)) ? "ምርጫውን አጽዳ" : "ሁሉንም ምረጥ"}</Button></div>
            </div>
          )}

          {rows.length === 0 && <div className="panel"><Empty>የሚከፈል ክፍያ የለም።</Empty></div>}
          {years.map((y) => {
            const list = byYear.get(y) ?? [];
            const o = list.filter(isOpen);
            const tag = y === cur ? "የአሁኑ ዓመት" : y > cur ? "ቀጣይ ዓመት" : "ያለፈ ዓመት";
            return (
              <div key={y} className={`year-block ${isClosed(y) ? "closed" : ""}`}>
                <button type="button" className="year-head" onClick={() => setClosed((c) => ({ ...c, [y]: !isClosed(y) }))} aria-expanded={!isClosed(y)}>
                  <div className="grow"><h2>{y} ዓ.ም. <span className="muted small" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>• {tag}</span></h2>
                    <div className="small muted">{o.length > 0 ? `ያልተከፈለ፦ ${o.length} ወራት • ${birr(o.reduce((s, r) => s + Number(r.amount), 0))}` : "ሁሉም ተከፍሏል"}</div></div>
                  <span className="chev"><Icon name="chevron" /></span>
                </button>
                {!isClosed(y) && (
                  <div className="year-body">
                    {o.length > 1 && <div className="mb"><Button variant="secondary" size="small" onClick={() => toggleMany(o)}>{o.every((r) => sel.has(r.id)) ? "ምርጫውን አጽዳ" : "የዓመቱን ያልተከፈሉ ሁሉ ምረጥ"}</Button></div>}
                    <div className="month-list">
                      {list.map((r) => {
                        const selectable = isOpen(r);
                        return (
                          <div key={r.id} className={`month-row ${sel.has(r.id) ? "sel" : ""} ${selectable ? "" : "locked"}`}>
                            <label>
                              <input type="checkbox" disabled={!selectable} checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                              <span className="grow"><b>{monthName(r.ethiopian_month)}</b>{r.status === "REJECTED" && r.reject_reason && <span className="small" style={{ color: "var(--bad)", display: "block" }}>አልተቀበለም፦ {r.reject_reason}</span>}</span>
                            </label>
                            <span className="nowrap">{birr(r.amount)}</span>{!selectable && <StatusBadge status={r.status} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="checkout"><div className="checkout-in">
            <div><div className="muted small">የተመረጠ፦ {sel.size} ወራት</div><div className="sum">ጠቅላላ፦ {birr(total)}</div></div>
            <Button size="big" disabled={sel.size === 0} onClick={() => { setErr(""); setStep("proof"); }}>የክፍያ ማረጋገጫ ያስገቡ</Button>
          </div></div>
        </>
      )}
      {step === "proof" && (
        <div className="panel" style={{ maxWidth: 640 }}>
          <div className="panel-title"><h2>የክፍያ ማረጋገጫ ያስገቡ</h2></div>
          <div className="notice info">
            <b>{sel.size} ወራት • {birr(total)}</b>
            <div className="small">{open.filter((r) => sel.has(r.id)).map((r) => formatPeriod(r.ethiopian_year, r.ethiopian_month)).join("፣ ")}</div>
          </div>
          {err && <div className="notice error" role="alert">{err}</div>}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(""); }} />
          <div className="dropzone" onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && input.current?.click()}>
            <Icon name="camera" />
            <div><b>{file ? file.name : "የክፍያ ደረሰኙን ምስል ይምረጡ"}</b></div>
            <div className="small muted">JPG፣ PNG፣ WebP ወይም PDF</div>
          </div>
          {preview && <img className="preview" src={preview} alt="የተመረጠ የክፍያ ማረጋገጫ" />}
          <div className="row mt"><Button variant="ghost" onClick={() => setStep("pick")}><Icon name="back" />ተመለስ</Button><div className="grow" /><Button size="big" busy={busy} disabled={!file} onClick={submit}>አስገባ</Button></div>
        </div>
      )}
    </>
  );
}

// ───────── የእኔ የክፍያ ታሪክ ─────────
function HistoryPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useData(() => api.get("/me/payments", { page }), [page]);
  const [proof, setProof] = useState<number | null>(null);
  if (loading && !data) return <Loading />;
  if (error || !data) return <div className="notice error">{error}</div>;
  return (
    <>
      <div className="page-head"><h1>የእኔ የክፍያ ታሪክ</h1></div>
      {data.rows.length === 0 ? <div className="panel"><Empty>እስካሁን ምንም ክፍያ አልገባም።</Empty></div> : (
        <div className="month-list">
          {data.rows.map((t: any) => (
            <div key={t.id} className="panel" style={{ marginTop: 0 }}>
              <div className="row between"><b>{birr(t.amount)}</b><TxBadge status={t.status} /></div>
              <div className="small muted">{t.reference_no} • {formatInstant(t.paid_at, true)} • {METHOD_LABEL[t.method]}</div>
              <div className="mt-s">{(t.items ?? []).map((i: any) => formatPeriod(i.year, i.month)).join("፣ ")}</div>
              {t.status === "REJECTED" && <div className="notice error mt-s small" style={{ marginBottom: 0 }}>ምክንያት፦ {t.reject_reason}</div>}
              <div className="row mt-s">
                {t.status === "VERIFIED" && <Button size="small" variant="secondary" onClick={() => startDownload(`/payments/${t.id}/confirmation`)}><Icon name="file" />የክፍያ ማረጋገጫ አውርድ</Button>}
                {t.proofs > 0 && <Button size="small" variant="ghost" onClick={() => setProof(t.id)}>የላኩትን ምስል እይ</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
      {proof && <Modal title="የላኩት የክፍያ ማረጋገጫ" onClose={() => setProof(null)}><img className="proof" src={`/api/payments/${proof}/proof`} alt="የክፍያ ማረጋገጫ" /><div className="row mt" style={{ justifyContent: "flex-end" }}><Button variant="ghost" onClick={() => setProof(null)}>ዝጋ</Button></div></Modal>}
    </>
  );
}