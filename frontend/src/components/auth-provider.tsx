"use client";
import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { authFetch, type User } from "@/lib/auth";

type AuthState = { user: User | null; loading: boolean; error: boolean; checkedPathname: string; refresh: () => Promise<void>; setUser: (user: User | null) => void; logout: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [checkedPathname, setCheckedPathname] = useState("");
  const revision = useRef(0), pathname = usePathname();
  function setUser(value: User | null) { revision.current++; setUserState(value); setLoading(false); setError(false); setCheckedPathname(pathname); }
  const checkSession = useCallback(async (signal?: AbortSignal) => {
    const current = ++revision.current;
    try { const result = await authFetch<{ user: User | null }>("me", { signal }); if (!signal?.aborted && current === revision.current) { setUserState(result.user); setError(false); } }
    catch { if (!signal?.aborted && current === revision.current) { setUserState(null); setError(true); } }
    finally { if (!signal?.aborted && current === revision.current) { setLoading(false); setCheckedPathname(pathname); } }
  }, [pathname]);
  async function refresh() { setLoading(true); await checkSession(); }
  useEffect(() => {
    const controller = new AbortController(), current = ++revision.current;
    void authFetch<{ user: User | null }>("me", { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted && current === revision.current) { setUserState(result.user); setError(false); }
    }).catch(() => {
      if (!controller.signal.aborted && current === revision.current) { setUserState(null); setError(true); }
    }).finally(() => { if (!controller.signal.aborted && current === revision.current) { setLoading(false); setCheckedPathname(pathname); } });
    return () => controller.abort();
  }, [pathname]);
  async function logout() {
    await authFetch<void>("logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setUser(null); setError(false);
  }
  return <AuthContext.Provider value={{ user, loading, error, checkedPathname, refresh, setUser, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error("AuthProvider is required.");
  return state;
}
