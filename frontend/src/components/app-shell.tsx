"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AccountNav } from "./account-nav";
import { Icon, type IconName } from "./icon";

const navigation: {
  href: string;
  label: string;
  icon: IconName;
}[] = [
  { href: "/", label: "Trang chủ", icon: "home" },
  { href: "/explore", label: "Khám phá tour", icon: "compass" },
  { href: "/planner", label: "Lập kế hoạch AI", icon: "sparkles" },
  { href: "/my-trips", label: "Chuyến đi của tôi", icon: "calendar" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState<string | null>(null);
  // Menu tự đóng khi đổi trang vì chỉ mở cho đúng pathname đã bấm.
  const open = menu === pathname;
  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div className="app-shell customer-shell flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Đến nội dung chính
      </a>
      <header className="site-header">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-6 px-5 sm:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="PickYourWay AI, trang chủ"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-800 text-white shadow-lg shadow-emerald-900/20">
              <Icon name="compass" className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-[17px] font-bold tracking-tight">
                PickYourWay
                <span className="ml-1 bg-gradient-to-r from-emerald-500 to-orange-400 bg-clip-text text-transparent">
                  AI
                </span>
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-[.2em] text-stone-400">
                Your trip, your way
              </span>
            </span>
          </Link>
          <nav
            aria-label="Điều hướng chính"
            className="hidden flex-1 items-center justify-center gap-1 lg:flex"
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active(item.href) ? "page" : undefined}
                className="site-nav-link"
              >
                <Icon name={item.icon} className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <AccountNav />
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white lg:hidden"
              aria-label={open ? "Đóng menu" : "Mở menu"}
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setMenu(open ? null : pathname)}
            >
              <Icon name={open ? "close" : "menu"} className="h-5 w-5" />
            </button>
          </div>
        </div>
        {open && (
          <nav
            id="mobile-nav"
            aria-label="Điều hướng chính"
            className="fade-up border-t border-stone-100 bg-white/95 px-5 py-4 lg:hidden"
          >
            <div className="grid gap-1 sm:grid-cols-2">
              {[...navigation, { href: "/account", label: "Tài khoản", icon: "user" as const }].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active(item.href) ? "page" : undefined}
                  className="site-nav-link justify-start py-3"
                >
                  <Icon name={item.icon} className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>
      <div id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </div>
      <footer className="mt-16 border-t border-stone-200/80 bg-white/60">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-800 text-white">
                <Icon name="compass" className="h-4 w-4" />
              </span>
              <span className="font-bold">PickYourWay AI</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-stone-500">
              Khám phá. Lên kế hoạch. Trải nghiệm. Chuyến đi theo cách của
              riêng bạn, với một chút trợ giúp từ AI.
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
              Khám phá
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-stone-600">
              <li><Link className="hover:text-emerald-700" href="/explore">Tất cả tour</Link></li>
              <li><Link className="hover:text-emerald-700" href="/explore/guides">Điểm đến tham khảo</Link></li>
              <li><Link className="hover:text-emerald-700" href="/planner">Lập kế hoạch AI</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
              Tài khoản
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-stone-600">
              <li><Link className="hover:text-emerald-700" href="/my-trips">Chuyến đi của tôi</Link></li>
              <li><Link className="hover:text-emerald-700" href="/account">Thông tin tài khoản</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-stone-200/70 py-5 text-center text-xs text-stone-400">
          © PickYourWay AI · Chuyến đi theo cách của bạn.
        </div>
      </footer>
    </div>
  );
}
