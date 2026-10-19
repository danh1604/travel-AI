"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { Category, TourListResponse } from "@/lib/explore";
import { useAuth } from "./auth-provider";
import { Icon, type IconName } from "./icon";
import { TourCard } from "./tour-card";

const steps: [string, string, IconName][] = [
  ["Kể mong muốn", "Điểm đến, số ngày, ngân sách và nhịp độ bạn thích — viết tự nhiên như trò chuyện.", "sparkles"],
  ["Nhận lịch từng ngày", "AI sắp xếp hoạt động sáng, chiều, tối từ lịch trình tour thật, kèm thời tiết.", "map"],
  ["Lưu & tinh chỉnh", "Giữ lịch trình trong tài khoản, chỉnh sửa ghi chú và mở lại bất cứ lúc nào.", "calendar"],
];

export function HomeDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [tours, setTours] = useState<TourListResponse | null>(null),
    [categories, setCategories] = useState<Category[] | null>(null);
  const [online, setOnline] = useState<boolean | null>(null),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      apiFetch<TourListResponse>("explore/tours?limit=3", {
        signal: controller.signal,
      }),
      apiFetch<{ data: Category[] }>("explore/categories", {
        signal: controller.signal,
      }),
      apiFetch<{ status: string }>("health", { signal: controller.signal }),
    ]).then(([list, options, health]) => {
      if (controller.signal.aborted) return;
      setTours(list.status === "fulfilled" ? list.value : null);
      setCategories(options.status === "fulfilled" ? options.value.data : null);
      setOnline(health.status === "fulfilled" && health.value.status === "ok");
      setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);
  const cover = tours?.data[0];
  const metrics: [string, string, IconName][] = [
    ["Tour đang hiển thị", tours ? String(tours.pagination.total) : "—", "compass"],
    ["Danh mục trải nghiệm", categories ? String(categories.length) : "—", "map"],
    ["Tài khoản của bạn", user ? "Đã đăng nhập" : "Khách", "user"],
    ["Lên lịch theo ý bạn", "Planner AI", "sparkles"],
  ];
  return (
    <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-8 sm:pt-8">
      <section className="home-hero fade-up min-h-[540px]">
        {cover?.coverImage && (
          <Image
            unoptimized
            priority
            src={cover.coverImage}
            alt=""
            fill
            sizes="(min-width:1280px) 1280px, 100vw"
            className="-z-10 object-cover"
          />
        )}
        <div className="hero-overlay absolute inset-0 -z-10" />
        <div className="grid h-full gap-10 px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-[1.25fr_1fr] lg:items-end">
          <div className="text-white">
            <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-semibold tracking-wide">
              <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-300 shadow-[0_0_0_4px_rgb(110_231_183/0.25)]" : "bg-white/50"}`} />
              {loading
                ? "Đang kiểm tra kết nối"
                : online
                  ? `Xin chào ${user ? user.name : "bạn"} · Sẵn sàng khám phá`
                  : "Đang chờ kết nối"}
            </span>
            <h1 className="display-type mt-6 text-[2.6rem] leading-[1.08] sm:text-6xl">
              Một ý tưởng nhỏ.
              <br />
              <span className="bg-gradient-to-r from-emerald-200 via-teal-100 to-orange-200 bg-clip-text text-transparent">
                Một chuyến đi
              </span>{" "}
              đáng nhớ.
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-white/80">
              Tìm cảm hứng từ những tour có sẵn, xem từng trải nghiệm và để AI
              phác thảo lịch trình theo đúng cách bạn muốn.
            </p>
            <form
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
                router.push(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore");
              }}
              className="hero-search mt-8 flex max-w-xl items-center gap-2 p-2 pl-4"
            >
              <Icon name="pin" className="h-5 w-5 shrink-0 text-emerald-600" />
              <label htmlFor="hero-q" className="sr-only">Bạn muốn đi đâu?</label>
              <input
                id="hero-q"
                name="q"
                type="search"
                maxLength={100}
                placeholder="Bạn muốn đi đâu? Ví dụ: Đà Lạt, Phú Quốc…"
                className="min-w-0 flex-1 py-2 text-sm text-stone-800 placeholder:text-stone-400"
              />
              <button type="submit" className="button-primary shrink-0 px-5">
                <Icon name="search" className="h-4 w-4" />
                <span className="hidden sm:inline">Tìm tour</span>
              </button>
            </form>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <Link href="/planner" className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-white transition hover:bg-white/20">
                <Icon name="sparkles" className="h-4 w-4" /> Lập lịch trình với AI
              </Link>
              <Link href="/explore" className="inline-flex items-center gap-1.5 font-medium text-white/80 hover:text-white">
                Xem tất cả tour <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </div>
          </div>
          {cover && (
            <Link
              href={`/explore/tours/${cover.id}`}
              className="glass group hidden max-w-sm justify-self-end rounded-3xl p-5 text-white transition hover:bg-white/20 lg:block"
            >
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-100">
                Gợi ý nổi bật
              </p>
              <h2 className="display-type mt-2 text-xl leading-snug">{cover.name}</h2>
              <p className="mt-3 flex items-center gap-3 text-xs text-white/75">
                <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3.5 w-3.5" />{cover.durationDays ? `${cover.durationDays} ngày` : "Linh hoạt"}</span>
                <span className="inline-flex items-center gap-1"><Icon name="pin" className="h-3.5 w-3.5" />{cover.departureLocation}</span>
              </p>
              <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold">
                Xem lịch trình <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          )}
        </div>
      </section>

      <section
        aria-label="Tổng quan"
        className="relative z-10 -mt-10 grid grid-cols-2 gap-3 px-2 sm:gap-4 sm:px-8 xl:grid-cols-4"
      >
        {metrics.map(([label, value, icon], index) => (
          <div key={label} className="stat-card fade-up" style={{ animationDelay: `${120 + index * 70}ms` }}>
            <span className="icon-bubble"><Icon name={icon} className="h-5 w-5" /></span>
            <p className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">
              {loading && !tours ? <span className="inline-block h-6 w-16 animate-pulse rounded bg-stone-100" /> : value}
            </p>
            <p className="mt-1 text-xs text-stone-500">{label}</p>
          </div>
        ))}
      </section>

      <section className="mt-20">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Tìm cảm hứng</p>
            <h2 className="display-type mt-3 text-3xl sm:text-4xl">
              Những chuyến đi để bắt đầu
            </h2>
          </div>
          <Link href="/explore" className="button-secondary">
            Xem tất cả <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
        {loading ? (
          <div role="status" aria-label="Đang tải các chuyến đi…" className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((key) => <div key={key} className="skeleton h-[380px]" />)}
          </div>
        ) : tours?.data.length ? (
          <>
            {!!categories?.length && (
              <div className="mb-6 flex flex-wrap gap-2">
                {categories.slice(0, 8).map((category) => (
                  <Link key={category.id} href={`/explore?category=${category.id}`} className="chip">
                    {category.name}
                  </Link>
                ))}
              </div>
            )}
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {tours.data.map((tour) => (
                <TourCard key={tour.id} tour={tour} />
              ))}
            </div>
            <p className="mt-5 text-xs leading-6 text-stone-500">
              Thông tin và giá nguồn cần được xác nhận trước khi sử dụng cho chuyến đi.
            </p>
          </>
        ) : (
          <div className="card border-dashed p-10 text-center">
            <span className="icon-bubble"><Icon name="compass" /></span>
            <p className="mt-4 font-semibold">
              {tours ? "Catalog chưa có tour đang hiển thị." : "Chưa tải được catalog tour."}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              Bạn vẫn có thể xem các màn hình và thử kết nối lại.
            </p>
            <button
              className="button-secondary mt-5"
              onClick={() => {
                setLoading(true);
                setAttempt((value) => value + 1);
              }}
            >
              Tải lại catalog
            </button>
          </div>
        )}
      </section>

      <section className="mt-24">
        <div className="text-center">
          <p className="eyebrow">Cách hoạt động</p>
          <h2 className="display-type mt-3 text-3xl sm:text-4xl">Ba bước cho một hành trình</h2>
        </div>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map(([title, text, icon], index) => (
            <li key={title} className="card relative p-7 transition hover:-translate-y-1 hover:shadow-lg">
              <span className="absolute right-6 top-5 font-[family-name:var(--font-display)] text-5xl font-bold text-emerald-50">
                0{index + 1}
              </span>
              <span className="icon-bubble"><Icon name={icon} /></span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-500">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative mt-20 overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950 px-7 py-12 text-white shadow-2xl shadow-emerald-950/20 sm:px-14">
        <div aria-hidden="true" className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-24 right-40 h-64 w-64 rounded-full bg-orange-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-8">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-200">Planner AI</p>
            <h2 className="display-type mt-3 text-3xl leading-tight sm:text-4xl">
              Chưa biết bắt đầu từ đâu? Để AI phác thảo giúp bạn.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/75">
              Chỉ cần vài dòng mô tả — lịch trình từng ngày, gợi ý tour khởi hành gần nhất và dự báo thời tiết sẽ sẵn sàng sau vài giây.
            </p>
          </div>
          <Link href="/planner" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-emerald-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-emerald-50">
            <Icon name="sparkles" className="h-4 w-4" /> Thử Planner ngay
          </Link>
        </div>
      </section>
    </main>
  );
}
