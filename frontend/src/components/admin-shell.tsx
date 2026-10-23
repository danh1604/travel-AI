"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { Icon, type IconName } from "./icon";
import { adminAccess } from "@/lib/admin-access";

const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Tổng quan", icon: "home" },
  { href: "/admin/tours", label: "Tour & lịch khởi hành", icon: "compass" },
  { href: "/admin/categories", label: "Danh mục tour", icon: "map" },
  { href: "/admin/travel/destinations", label: "Điểm đến & dịch vụ", icon: "pin" },
  { href: "/admin/users", label: "Tài khoản", icon: "user" },
  { href: "/admin/reviews", label: "Đánh giá & nhận xét", icon: "shield" },
];
export function AdminShell({ children, development }: { children: ReactNode; development: boolean }) {
  const pathname = usePathname(), router = useRouter();
  const { user, loading, error, checkedPathname, refresh, logout } = useAuth();
  const [pending, setPending] = useState(false), [logoutError, setLogoutError] = useState("");
  if (pathname === "/admin/login") return <div className="admin-login-surface"><div className="mx-auto max-w-6xl px-6 py-6"><Link href="/" className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm"><Icon name="compass" className="h-4 w-4" /> PickYourWay · Về trang du lịch</Link></div>{children}</div>;
  const access = adminAccess({ loading, error, role: user?.role ?? null, checked: checkedPathname, pathname });
  if (access !== "allowed") return <main className="admin-login-surface flex min-h-screen items-center justify-center p-6"><section className="card fade-up w-full max-w-lg p-8 shadow-xl"><span className="icon-bubble h-14 w-14 rounded-2xl">{access === "checking" ? <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-600" /> : <Icon name="shield" className="h-6 w-6" />}</span><h1 className="mt-5 text-2xl font-semibold">{access === "checking" ? "Đang kiểm tra quyền truy cập…" : access === "unavailable" ? "Chưa kết nối được tài khoản" : access === "login" ? "Đăng nhập khu vực quản trị" : "Khu vực dành cho quản trị viên"}</h1><p role={access === "checking" ? "status" : undefined} className="mt-3 text-sm leading-7 text-stone-600">{access === "checking" ? "Vui lòng chờ trong giây lát." : access === "unavailable" ? "Kiểm tra kết nối rồi thử lại nhé." : access === "login" ? "Dùng tài khoản có quyền quản trị để tiếp tục." : "Tài khoản hiện tại không có quyền quản trị. Bạn vẫn có thể khám phá tour và sử dụng Planner."}</p><div className="mt-6 flex flex-wrap gap-3">{access === "unavailable" ? <button className="button-primary" onClick={() => void refresh()}>Thử lại</button> : access !== "checking" && <Link className="button-primary" href={`/admin/login?next=${encodeURIComponent(pathname)}`}>Đăng nhập quản trị</Link>}<Link className="button-secondary" href="/">Về trang du lịch</Link></div></section></main>;
  const items = development ? [...navigation, { href: "/admin/tools", label: "Công cụ kiểm tra", icon: "code" as const }] : navigation;
  const active = (href: string) => href === "/admin" ? pathname === href : href === "/admin/travel/destinations" ? pathname.startsWith("/admin/travel") : pathname === href || pathname.startsWith(`${href}/`);
  const label = pathname.endsWith("/departures") ? "Quản lý lịch khởi hành" : pathname.endsWith("/content") ? "Nội dung tour" : items.find((item) => active(item.href))?.label ?? "Quản trị";
  const initials = (user?.name ?? "A").trim().split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase();
  async function signOut() { setPending(true); setLogoutError(""); try { await logout(); router.replace("/admin/login"); } catch { setLogoutError("Chưa đăng xuất được. Bạn thử lại nhé."); } finally { setPending(false); } }
  return <div className="app-shell admin-shell">
    <a href="#admin-main-content" className="skip-link">Đến nội dung quản trị</a>
    <aside className="app-sidebar admin-sidebar">
      <Link href="/admin" className="flex items-center gap-3 px-2 py-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 to-emerald-600 text-emerald-950 shadow-lg shadow-emerald-500/20"><Icon name="compass" /></span>
        <span className="font-bold tracking-tight text-white">PickYourWay<span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-300/80">Admin console</span></span>
      </Link>
      <p className="mt-6 hidden px-3 text-[10px] font-bold uppercase tracking-[.2em] text-emerald-300/50 lg:block">Quản lý</p>
      <nav aria-label="Điều hướng quản trị" className="shell-nav">{items.map((item) => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined} className={`shell-link ${active(item.href) ? "shell-link-active" : ""}`}><Icon name={item.icon} className="h-[18px] w-[18px]" /><span>{item.label}</span></Link>)}</nav>
      <div className="mt-auto hidden space-y-3 lg:block">
        <Link href="/" className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-emerald-50 transition hover:bg-white/10"><span><span className="block font-semibold">Trang khách hàng</span><span className="mt-0.5 block text-xs text-emerald-200/60">Xem như người dùng</span></span><Icon name="arrow" className="h-4 w-4 -rotate-45" /></Link>
        <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-300 to-orange-500 text-sm font-bold text-white">{initials}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{user?.name}</span><span className="block text-xs text-emerald-300/70">Quản trị viên</span></span>
          <button disabled={pending} title="Đăng xuất" aria-label="Đăng xuất" className="flex h-9 w-9 items-center justify-center rounded-lg text-emerald-100/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50" onClick={() => void signOut()}><Icon name="logout" className="h-[18px] w-[18px]" /></button>
        </div>
      </div>
    </aside>
    <div className="app-content">
      <header className="shell-header admin-header">
        <div><p className="flex items-center gap-1.5 text-xs text-stone-400"><span>Quản trị</span><span>/</span><span className="font-medium text-emerald-700">{label}</span></p><p className="mt-1 text-lg font-semibold tracking-tight">{label}</p></div>
        <div className="flex flex-wrap items-center justify-end gap-3"><Link href="/" className="admin-pill hidden sm:inline-flex">Trang khách hàng ↗</Link><button disabled={pending} className="admin-action lg:hidden" onClick={() => void signOut()}>{pending ? "Đang thoát…" : "Đăng xuất"}</button>{pending && <span role="status" className="hidden text-xs text-stone-500 lg:inline">Đang thoát…</span>}</div>
      </header>
      {logoutError && <p role="alert" className="m-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{logoutError}</p>}
      <div id="admin-main-content" tabIndex={-1} className="min-h-[calc(100vh-130px)] outline-none">{children}</div>
      <footer className="mx-6 border-t border-stone-200 py-5 text-xs text-stone-400 sm:mx-10">PickYourWay · Quản trị nội dung và dịch vụ</footer>
    </div>
  </div>;
}
