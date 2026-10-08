import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { formatInstant, formatPeriod } from "../../shared/calendar/ethiopian";
import { METHOD_LABEL, ROLE_LABEL } from "../../shared/labels";
import { api } from "../api";
import { useAuth } from "../auth";
import { Icon } from "../icons";
import { ThemeToggle } from "../theme";
import { Button, birr, Empty, Loading, Logo, PageHead, useData, useLookups, LookupProvider, useMeta } from "../ui";
import { ChangePasswordForm } from "./Auth";
import { MemberDetailPage, MemberFormPage } from "./StaffMembers";
import { FollowUpPage } from "./StaffFollowUp";
import { MemberListPage } from "./StaffMemberList";
import { PaymentDetailPage, PaymentsPage, ReviewsPage } from "./StaffPayments";
import { MatrixPage, ReportsPage } from "./StaffReports";
import { AuditPage, SettingsPage, StaffAdminsPage } from "./StaffAdmin";

export const BaseCtx = createContext("/finance");
export const useBase = () => useContext(BaseCtx);

export function StaffApp({ base }: { base: "/admin" | "/finance" }) {
  const { user, logout } = useAuth();
  const { meta } = useMeta();
  const loc = useLocation();
  const [pending, setPending] = useState(0);
  const isAdmin = user?.role === "ADMIN";
  useEffect(() => { api.get("/payments", { txStatus: "PENDING", pageSize: 1 }).then((r) => setPending(r.total)).catch(() => {}); }, [loc.pathname]);
  const links: [string, string, ReactNode?][] = [
    ["", "ዋና ገጽ"], ["/members", "አባላት"], ["/member-list", "የአባላት ዝርዝር"], ["/reviews", "ማረጋገጫዎች", pending > 0 ? <span className="count">{pending}</span> : null],
    ["/status", "የክፍያ ሁኔታ"], ["/reports", "ሪፖርት"], ["/payments", "የክፍያ ታሪክ"],
    ...(isAdmin ? ([["/settings", "ቅንብር"], ["/staff", "የገንዘብ ያዦች"], ["/audit", "የተግባር ታሪክ"]] as [string, string][]) : []),
  ];
  return (
    <BaseCtx.Provider value={base}>
      <LookupProvider>
        <header className="topbar">
          <div className="topbar-inner">
            <Link to={base} className="brand grow" style={{ textDecoration: "none" }}><Logo /><span>{meta?.orgName}</span></Link>
            <div className="user-chip"><b>{user?.fullName}</b><div>{ROLE_LABEL[user?.role ?? ""]}</div></div>
            <ThemeToggle />
            <Link to={`${base}/password`} className="btn ghost small">የይለፍ ቃል</Link>
            <Button variant="ghost" size="small" onClick={logout}>ውጣ</Button>
          </div>
        </header>
        <nav className="nav"><div className="nav-inner">
          {links.map(([to, label, extra]) => <NavLink key={to} to={base + to} end={to === ""}>{label}{extra}</NavLink>)}
        </div></nav>
        <main className="container">
          <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="members" element={<FollowUpPage />} />
            <Route path="member-list" element={<MemberListPage />} />
            <Route path="members/new" element={<MemberFormPage />} />
            <Route path="members/:id" element={<MemberDetailPage />} />
            <Route path="members/:id/edit" element={<MemberFormPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="payments/:id" element={<PaymentDetailPage />} />
            <Route path="status" element={<MatrixPage />} />
            <Route path="reports" element={<ReportsPage />} />
            {isAdmin && <Route path="settings" element={<SettingsPage />} />}
            {isAdmin && <Route path="staff" element={<StaffAdminsPage />} />}
            {isAdmin && <Route path="audit" element={<AuditPage />} />}
            <Route path="password" element={<><PageHead title="የይለፍ ቃሌን ቀይር" /><div className="panel"><ChangePasswordForm /></div></>} />
            <Route path="*" element={<DashboardPage />} />
          </Routes>
        </main>
      </LookupProvider>
    </BaseCtx.Provider>
  );
}

function DashboardPage() {
  const base = useBase();
  const { data, loading, error } = useData(() => api.get("/dashboard"), []);
  const { data: lookups } = useLookups();
  if (loading && !data) return <Loading />;
  if (error || !data) return <div className="notice error">{error}</div>;
  const d = data;
  void lookups;
  return (
    <>
      <PageHead title="ዋና ገጽ" />
      <div className="panel">
        <div className="stats">
          <div className="stat"><div className="v">{d.totalMembers}</div><div className="k">ጠቅላላ አባላት</div></div>
          <div className="stat g"><div className="v">{d.month.paid}</div><div className="k">የዚህ ወር የከፈሉ</div></div>
          <div className="stat r"><div className="v">{d.month.unpaid}</div><div className="k">ያልከፈሉ</div></div>
          <div className="stat a"><div className="v">{d.month.pending}</div><div className="k">በማረጋገጥ ላይ</div></div>
          <div className="stat"><div className="v">{birr(d.collected.year)}</div><div className="k">የ{d.period.year} ዓ.ም. ጠቅላላ የተሰበሰበ</div></div>
        </div>
        <div className="small muted mt-s">ወር፦ {formatPeriod(d.period.year, d.period.month)} • በዚህ ወር የተሰበሰበ፦ {birr(d.collected.month)}</div>
      </div>

      <h2 className="mt mb">ፈጣን ተግባራት</h2>
      <div className="quick">
        <Link to={`${base}/members/new`}><Icon name="plus" />አዲስ አባል</Link>
        <Link to={`${base}/members`}><Icon name="card" />ክፍያ መመዝገብ</Link>
        <Link to={`${base}/status`}><Icon name="table" />የክፍያ ሁኔታ</Link>
        <Link to={`${base}/reports`}><Icon name="download" />ሪፖርት</Link>
      </div>

      <div className="two mt">
        <div className="panel">
          <div className="panel-title"><h2>የሚጠባበቁ ማረጋገጫዎች {d.pendingCount > 0 && <span className="count">{d.pendingCount}</span>}</h2><Link to={`${base}/reviews`} className="small">ሁሉንም እይ</Link></div>
          {d.pending.length === 0 ? <Empty>የሚጠባበቅ ማረጋገጫ የለም። </Empty> : d.pending.map((t: any) => (
            <Link key={t.id} to={`${base}/payments/${t.id}`} className="list-link">
              <div><b>{t.full_name}</b><div className="small muted">{t.items?.length ?? 0} ወራት • {formatInstant(t.created_at, true)}</div></div>
              <b className="nowrap">{birr(t.amount)}</b>
            </Link>
          ))}
        </div>
        <div className="panel">
          <div className="panel-title"><h2>የቅርብ ጊዜ ክፍያዎች</h2><Link to={`${base}/payments`} className="small">ሁሉንም እይ</Link></div>
          {d.recent.length === 0 ? <Empty>እስካሁን የተረጋገጠ ክፍያ የለም።</Empty> : d.recent.map((t: any) => (
            <Link key={t.id} to={`${base}/payments/${t.id}`} className="list-link">
              <div><b>{t.full_name}</b><div className="small muted">{formatInstant(t.paid_at)} • {METHOD_LABEL[t.method]}</div></div>
              <b className="nowrap">{birr(t.amount)}</b>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
