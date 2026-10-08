import { FormEvent, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Button, errMsg, Field, Logo, useMeta, useToast } from "../ui";

const PORTAL = {
  member: { title: "የአባላት መግቢያ", hint: "በስልክ ቁጥርዎና በይለፍ ቃልዎ ይግቡ።" },
  admin: { title: "የአስተዳዳሪ መግቢያ", hint: "ለዋና አስተዳዳሪ ብቻ።" },
  finance: { title: "የገንዘብ ያዥ መግቢያ", hint: "ለገንዘብ ያዦች ብቻ።" },
} as const;

export function LoginPage({ portal }: { portal: keyof typeof PORTAL }) {
  const { refresh } = useAuth();
  const { meta } = useMeta();
  const [phone, setPhone] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [show, setShow] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { await api.post("/auth/login", { phone, password, portal }); await refresh(); }
    catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <Logo size={76} className="logo" />
        <h1>{meta?.orgName ?? "መሠረተ ሕይወት ሰንበት ትምህርት ቤት"}</h1>
        <h2>{PORTAL[portal].title}</h2>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <Field label="ስልክ ቁጥር"><input className="input" inputMode="tel" autoComplete="username" placeholder="0911223344" value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus /></Field>
          <Field label="የይለፍ ቃል">
            <div style={{ position: "relative" }}>
              <input className="input" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ paddingRight: 70 }} />
              <button type="button" className="btn ghost small" style={{ position: "absolute", right: 4, top: 4 }} onClick={() => setShow(!show)}>{show ? "ደብቅ" : "አሳይ"}</button>
            </div>
          </Field>
        </div>
        <Button type="submit" className="block big mt" busy={busy}>ግባ</Button>
        <div className="auth-links">
          {portal === "member" && <>የይለፍ ቃልዎን ረስተዋል? ለገንዘብ ያዡ ይንገሩ፤ አዲስ የይለፍ ቃል ይሰጥዎታል።</>}
          {portal !== "member" && <a href="/">የአባላት መግቢያ</a>}
          {meta?.orgPhone && <div className="mt-s small">ስልክ፦ {meta.orgPhone}</div>}
        </div>
      </form>
    </div>
  );
}

export function ChangePasswordForm({ forced, onDone }: { forced?: boolean; onDone?: () => void }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState(""), [next, setNext] = useState(""), [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    if (next !== again) return setError("አዲሱ የይለፍ ቃልና ማረጋገጫው አይመሳሰሉም።");
    setBusy(true);
    try { const r = await api.post("/auth/change-password", { currentPassword: cur, newPassword: next }); toast(r.message); setCur(""); setNext(""); setAgain(""); await refresh(); onDone?.(); }
    catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} style={{ maxWidth: 420 }}>
      {forced && <div className="notice warn"><b>እባክዎ የመጀመሪያ ጊዜ የመግቢያ ይለፍ ቃልዎን ይቀይሩ። ለደህንነትዎ አዲስ የግል ይለፍ ቃል ያዘጋጁ።</b></div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
        <Field label={forced ? "የመጀመሪያ የይለፍ ቃል" : "አሁን ያለዎት የይለፍ ቃል"}><input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
        <Field label="አዲስ የይለፍ ቃል" hint="ቢያንስ 8 ፊደላት"><input className="input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required /></Field>
        <Field label="አዲሱን የይለፍ ቃል ደግመው ያስገቡ"><input className="input" type="password" autoComplete="new-password" minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} required /></Field>
      </div>
      <Button type="submit" className="big mt" busy={busy}>{forced ? "ይለፍ ቃል ቀይር" : "የይለፍ ቃሌን ቀይር"}</Button>
    </form>
  );
}

export function ForcedPasswordPage() {
  const { logout } = useAuth();
  return (
    <div className="auth">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <Logo size={64} className="logo" />
        <h1>የይለፍ ቃልዎን ይቀይሩ</h1>
        <h2>ይህ የመጀመሪያ ጊዜ መግቢያዎ ስለሆነ ለደህንነትዎ የመጀመሪያ ይለፍ ቃልዎን ወደ የግል ይለፍ ቃል መቀየር ያስፈልጋል።</h2>
        <ChangePasswordForm forced />
        <div className="auth-links"><button className="btn ghost small" onClick={logout}>ውጣ</button></div>
      </div>
    </div>
  );
}
