import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { daysInMonth, ETHIOPIAN_MONTHS, EtDate } from "../shared/calendar/ethiopian";
import { STATUS_LABEL, TX_STATUS_LABEL } from "../shared/labels";
import { api, ApiError, startDownload } from "./api";
import { Icon } from "./icons";

// ───────── toasts ─────────
type Toast = { id: number; text: string; kind: "ok" | "error" };
const ToastCtx = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, text, kind }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "ያልታሰበ ስህተት ተፈጥሯል። እባክዎ ደግመው ይሞክሩ።");

// ───────── site meta (organisation name / logo) ─────────
export interface Meta { orgName: string; orgPhone: string; orgEmail: string; orgAddress: string; hasLogo: boolean; logoVersion: string | null; startYear: number; billPagumen: boolean; currentPeriod: { year: number; month: number }; today: EtDate }
const MetaCtx = createContext<{ meta: Meta | null; reload: () => void }>({ meta: null, reload: () => {} });
export const useMeta = () => useContext(MetaCtx);
export function MetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const reload = useCallback(() => { api.get("/public/meta").then(setMeta).catch(() => {}); }, []);
  useEffect(reload, [reload]);
  useEffect(() => { if (meta) document.title = meta.orgName; }, [meta]);
  return <MetaCtx.Provider value={{ meta, reload }}>{children}</MetaCtx.Provider>;
}

export function Logo({ size = 38, className = "" }: { size?: number; className?: string }) {
  const { meta } = useMeta();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [meta?.logoVersion]);
  if (meta?.hasLogo && !broken)
    return <img src={`/api/public/logo?v=${encodeURIComponent(meta.logoVersion ?? "")}`} alt="" className={className} style={{ width: size, height: size }} onError={() => setBroken(true)} />;
  return (
    <div className={`logo-fallback ${className}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 3v18M6 9h12" /></svg>
    </div>
  );
}

// ───────── lookups (departments / member types / categories) ─────────
export interface Lookup { id: number; name: string; is_active: boolean; members: number; amount?: number | null }
export interface Lookups { departments: Lookup[]; memberTypes: Lookup[]; categories: Lookup[] }
const LookupCtx = createContext<{ data: Lookups | null; reload: () => Promise<void> }>({ data: null, reload: async () => {} });
export const useLookups = () => useContext(LookupCtx);
export function LookupProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Lookups | null>(null);
  const reload = useCallback(async () => { setData(await api.get("/config/lookups")); }, []);
  useEffect(() => { reload().catch(() => {}); }, [reload]);
  return <LookupCtx.Provider value={{ data, reload }}>{children}</LookupCtx.Provider>;
}

// ───────── small building blocks ─────────
export const money = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const birr = (n: number | string | null | undefined) => `${money(n)} ብር`;

export function StatusBadge({ status }: { status: string }) { return <span className={`badge ${status}`}>{STATUS_LABEL[status] ?? status}</span>; }
export function TxBadge({ status }: { status: string }) { return <span className={`badge ${status}`}>{TX_STATUS_LABEL[status] ?? status}</span>; }
export function Mark({ status }: { status?: string | null }) {
  const label = status ? STATUS_LABEL[status] : "አይመለከተውም";
  return (
    <span className={`mark ${status ?? "NONE"}`} title={label} role="img" aria-label={label}>
      {status === "PAID" ? <Icon name="check" /> : status === "PENDING" ? <Icon name="dots" /> : status === "UNPAID" || status === "REJECTED" ? <Icon name="x" /> : <span className="dash" />}
    </span>
  );
}

export function Loading() { return <div className="spinner" role="progressbar" aria-label="በመጫን ላይ" />; }
export function Empty({ children = "ምንም መረጃ አልተገኘም።" }: { children?: ReactNode }) { return <div className="empty">{children}</div>; }

export function Button({ variant = "primary", size, busy, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "success" | "danger"; size?: "big" | "small"; busy?: boolean }) {
  const cls = ["btn", variant === "primary" ? "" : variant, size ?? "", p.className ?? ""].join(" ").trim();
  return <button type="button" {...p} className={cls} disabled={p.disabled || busy}>{busy ? "እባክዎ ይጠብቁ…" : children}</button>;
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <div className={`field ${className}`}><label>{label}</label>{children}{hint && <span className="hint">{hint}</span>}</div>;
}

export function Select({ value, onChange, options, all = "ሁሉም", disabled }: {
  value: string | number | undefined; onChange: (v: string) => void; options: { value: string | number; label: string }[]; all?: string | null; disabled?: boolean;
}) {
  return (
    <select className="select" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {all !== null && <option value="">{all}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}><h2>{title}</h2>{children}</div>
    </div>
  );
}

export function ConfirmModal({ title, text, confirmLabel, danger, onConfirm, onClose }: { title: string; text: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <div>{text}</div>
      <div className="row mt" style={{ justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>ተወው</Button>
        <Button variant={danger ? "danger" : "primary"} busy={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function Pager({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
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

/** Ethiopian date picker: year / month / day; the number of days comes from the calendar service (ጳጉሜን = 5 or 6). */
export function EtDateInput({ value, onChange, startYear, endYear, clearable }: { value: EtDate | null; onChange: (d: EtDate | null) => void; startYear: number; endYear: number; clearable?: boolean }) {
  const years: number[] = []; for (let y = startYear; y <= endYear; y++) years.push(y);
  const set = (p: Partial<EtDate>) => {
    const base = value ?? { year: endYear, month: 1, day: 1 };
    const next = { ...base, ...p };
    next.day = Math.min(next.day, daysInMonth(next.year, next.month));
    onChange(next);
  };
  const days = value ? daysInMonth(value.year, value.month) : 30;
  return (
    <div className="et-date">
      <select className="select" aria-label="ዓመት" value={value?.year ?? ""} onChange={(e) => (e.target.value ? set({ year: Number(e.target.value) }) : clearable && onChange(null))}>
        {clearable && <option value="">—</option>}{years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <select className="select" aria-label="ወር" value={value?.month ?? ""} disabled={!value} onChange={(e) => set({ month: Number(e.target.value) })}>
        {ETHIOPIAN_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select className="select" aria-label="ቀን" value={value?.day ?? ""} disabled={!value} onChange={(e) => set({ day: Number(e.target.value) })}>
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
  );
}

export function DownloadButtons({ path, params, labels }: { path: string; params?: Record<string, any>; labels?: [string, string] }) {
  return (
    <div className="dl">
      <Button variant="secondary" size="small" onClick={() => startDownload(path, { ...params, format: "xlsx" })}><Icon name="download" />{labels?.[0] ?? "ኤክሴል አውርድ"}</Button>
      <Button variant="secondary" size="small" onClick={() => startDownload(path, { ...params, format: "pdf" })}><Icon name="file" />{labels?.[1] ?? "ፒዲኤፍ አውርድ"}</Button>
    </div>
  );
}

export function PageHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <div className="page-head"><h1>{title}</h1>{children && <div className="row">{children}</div>}</div>;
}

export async function copyText(text: string, toast: (t: string, k?: "ok" | "error") => void) {
  try { await navigator.clipboard.writeText(text); toast("ተቀድቷል።"); }
  catch { toast("መቅዳት አልተቻለም። እባክዎ በእጅ ይቅዱ።", "error"); }
}

/** Generic data loader: `const { data, loading, error, reload } = useData(() => api.get(...), [deps])` */
export function useData<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true); setError("");
    fn().then((d) => live && setData(d)).catch((e) => live && setError(errMsg(e))).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
