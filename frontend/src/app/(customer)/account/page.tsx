"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export default function AccountPage() {
  const { user, loading, error, refresh, logout } = useAuth(), router = useRouter();
  const [pending, setPending] = useState(false), [logoutError, setLogoutError] = useState("");
  if (loading) return <main className="mx-auto max-w-3xl px-6 py-20" role="status">Đang tải tài khoản…</main>;
  if (error) return <main className="mx-auto max-w-3xl px-6 py-20"><h1 className="text-2xl font-semibold">Chưa tải được tài khoản</h1><button className="button-primary mt-5" onClick={() => void refresh()}>Thử lại</button></main>;
  if (!user) return <main className="mx-auto max-w-3xl px-6 py-20"><h1 className="display-type text-4xl">Bạn chưa đăng nhập</h1><p className="mt-4 text-stone-600">Đăng nhập để xem thông tin tài khoản.</p><Link href="/login" className="button-primary mt-6 inline-flex">Đăng nhập →</Link></main>;
  return <main className="mx-auto max-w-3xl px-4 py-14 sm:px-8"><p className="eyebrow">Tài khoản của bạn</p><h1 className="display-type mt-3 text-4xl">Chào, {user.name}</h1><section className="card mt-8 overflow-hidden"><div className="flex items-center gap-4 bg-gradient-to-r from-emerald-700 to-teal-800 p-6 text-white"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold">{user.name.trim().charAt(0).toUpperCase()}</span><div><p className="text-lg font-semibold">{user.name}</p><span className="mt-1 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-xs">{user.role === "ADMIN" ? "Quản trị viên" : "Thành viên"}</span></div></div><dl className="space-y-4 p-6"><div><dt className="text-sm text-stone-500">Tên</dt><dd className="mt-1 font-semibold">{user.name}</dd></div><div><dt className="text-sm text-stone-500">Email</dt><dd className="mt-1 break-all font-semibold">{user.email}</dd></div><div><dt className="text-sm text-stone-500">Vai trò</dt><dd className="mt-1 font-semibold">{user.role === "ADMIN" ? "Quản trị viên" : "Người dùng"}</dd></div></dl></section><div className="mt-6 flex flex-wrap gap-4"><Link className="button-primary" href="/explore">Khám phá chuyến đi ↗</Link>{user.role === "ADMIN" && <Link className="button-primary" href="/admin">Trang quản trị</Link>}<button disabled={pending} className="button-secondary text-red-700 hover:border-red-200 hover:bg-red-50 disabled:opacity-60" onClick={async () => {
    setPending(true); setLogoutError(""); try { await logout(); router.replace("/login"); } catch { setLogoutError("Chưa đăng xuất được. Vui lòng thử lại."); } finally { setPending(false); }
  }}>{pending ? "Đang đăng xuất…" : "Đăng xuất"}</button></div>{logoutError && <p role="alert" className="mt-4 text-sm text-red-700">{logoutError}</p>}</main>;
}
