"use client";
import Link from "next/link";
import { useAuth } from "./auth-provider";

export function AccountNav() {
  const { user, loading, error } = useAuth();
  if (loading) return <span className="h-10 w-28 animate-pulse rounded-full bg-stone-100" role="status" aria-label="Đang tải tài khoản…" />;
  if (error) return <Link href="/account" className="button-secondary min-h-10 py-2">Tài khoản</Link>;
  if (!user) return <div className="flex items-center gap-2"><Link href="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-stone-700 hover:text-emerald-800 sm:inline-block">Đăng nhập</Link><Link href="/register" className="button-primary min-h-10 px-4 py-2 text-[13px]">Đăng ký</Link></div>;
  const initials = user.name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase();
  return <div className="flex items-center gap-2">
    {user.role === "ADMIN" && <Link href="/admin" className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 xl:inline-block">Quản trị ↗</Link>}
    <Link href="/account" className="flex items-center gap-2 rounded-full border border-stone-200 bg-white py-1 pl-1 pr-3 text-sm font-semibold text-stone-700 transition hover:border-emerald-300" title={user.name}>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-700 text-xs font-bold text-white">{initials || "U"}</span>
      <span className="hidden max-w-28 truncate sm:inline">{user.name}</span>
    </Link>
  </div>;
}
