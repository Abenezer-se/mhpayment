import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";

export interface User { id: string; role: "ADMIN" | "FINANCE" | "MEMBER"; phone: string; fullName: string; mustChangePassword: boolean; memberId: number | null; memberCode: string | null }
const Ctx = createContext<{ user: User | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> }>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setUser((await api.get<{ user: User | null }>("/auth/me")).user); } catch { setUser(null); } finally { setLoading(false); }
  }, []);
  const logout = useCallback(async () => { try { await api.post("/auth/logout"); } catch { /* ignore */ } setUser(null); }, []);
  useEffect(() => { setUnauthorizedHandler(() => setUser(null)); refresh(); }, [refresh]);
  return <Ctx.Provider value={{ user, loading, refresh, logout }}>{children}</Ctx.Provider>;
}
