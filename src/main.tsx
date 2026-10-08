import "@fontsource/noto-sans-ethiopic/ethiopic-400.css";
import "@fontsource/noto-sans-ethiopic/ethiopic-500.css";
import "@fontsource/noto-sans-ethiopic/ethiopic-700.css";
import "@fontsource/noto-sans-ethiopic/latin-400.css";
import "@fontsource/noto-sans-ethiopic/latin-700.css";
import "@fontsource/noto-serif-ethiopic/ethiopic-600.css";
import "@fontsource/noto-serif-ethiopic/ethiopic-700.css";
import "@fontsource/noto-serif-ethiopic/latin-600.css";
import "@fontsource/noto-serif-ethiopic/latin-700.css";
import "./styles.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { ForcedPasswordPage, LoginPage } from "./pages/Auth";
import { MemberApp } from "./pages/Member";
import { StaffApp } from "./pages/StaffShell";
import { ThemeToggle } from "./theme";
import { Loading, MetaProvider, ToastProvider } from "./ui";

/** Guards a portal: shows its login page, forces the first password change, and keeps each role on its own route. */
function Portal({ portal }: { portal: "member" | "admin" | "finance" }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <><ThemeToggle floating /><LoginPage portal={portal} /></>;
  const home = user.role === "ADMIN" ? "/admin" : user.role === "FINANCE" ? "/finance" : "/";
  const mine = { member: "MEMBER", admin: "ADMIN", finance: "FINANCE" }[portal];
  if (user.role !== mine) return <Navigate to={home} replace />;
  if (user.mustChangePassword) return <><ThemeToggle floating /><ForcedPasswordPage /></>;
  return portal === "member" ? <MemberApp /> : <StaffApp base={portal === "admin" ? "/admin" : "/finance"} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MetaProvider>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/admin/*" element={<Portal portal="admin" />} />
              <Route path="/finance/*" element={<Portal portal="finance" />} />
              <Route path="/*" element={<Portal portal="member" />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MetaProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// Makes the site installable on phones. It does not cache anything (see public/sw.js).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
}