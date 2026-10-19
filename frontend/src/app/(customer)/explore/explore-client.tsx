"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import {
  formatVnd,
  formatSourcePrice,
  type Category,
  type CatalogMeta,
  type TourListResponse,
} from "@/lib/explore";
import { CatalogNotice } from "@/components/catalog-notice";
import { TourCard } from "@/components/tour-card";
import { Icon } from "@/components/icon";

export default function ExploreClient() {
  const params = useSearchParams(),
    router = useRouter();
  const q = params.get("q") ?? "",
    category = params.get("category") ?? "",
    page = params.get("page") ?? "1";
  const view = params.get("view") === "table" ? "table" : "grid";
  const [result, setResult] = useState<TourListResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(),
      query = new URLSearchParams({ q, category, page, limit: "9" });
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [list, options] = await Promise.all([
          apiFetch<TourListResponse>(`explore/tours?${query}`, {
            signal: controller.signal,
          }),
          apiFetch<{ data: Category[]; meta: CatalogMeta }>(
            "explore/categories",
            { signal: controller.signal },
          ),
        ]);
        if (!controller.signal.aborted) {
          setResult(list);
          setCategories(options.data);
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof ApiError && reason.status === 400
              ? "Bộ lọc hoặc số trang không hợp lệ. Hãy xóa bộ lọc và thử lại."
              : "Chưa tải được danh sách tour. Vui lòng thử lại sau ít phút.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [q, category, page, attempt]);
  function pageUrl(next: number) {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (category) query.set("category", category);
    if (view === "table") query.set("view", "table");
    query.set("page", String(next));
    return `/explore?${query}`;
  }
  function viewUrl(value: "grid" | "table") {
    const query = new URLSearchParams(params.toString());
    query.set("view", value);
    return `/explore?${query}`;
  }
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 px-6 pb-24 pt-12 text-white sm:px-12">
        <div aria-hidden="true" className="absolute -right-10 -top-16 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" />
        <div aria-hidden="true" className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-orange-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-200">Khám phá</p>
            <h1 className="display-type mt-3 text-4xl sm:text-5xl">
              Đi đâu tiếp theo?
            </h1>
            <p className="mt-4 max-w-xl text-white/75">
              Tìm một chuyến đi phù hợp, khám phá lịch trình và những trải nghiệm
              đang chờ bạn.
            </p>
          </div>
          <Link href="/explore/guides" className="glass inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition hover:bg-white/20">
            <Icon name="map" className="h-4 w-4" /> Điểm tham khảo từ Traveloka & Vietnam Tourism
          </Link>
        </div>
      </div>
      <form
        key={`${q}:${category}`}
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget),
            query = new URLSearchParams();
          const search = String(values.get("q") ?? "").trim(),
            selected = String(values.get("category") ?? "");
          if (search) query.set("q", search);
          if (selected) query.set("category", selected);
          if (view === "table") query.set("view", "table");
          router.push(`/explore${query.size ? `?${query}` : ""}`);
        }}
        className="card relative z-10 mx-3 -mt-14 mb-8 grid gap-4 p-5 shadow-xl shadow-emerald-950/10 sm:mx-8 md:grid-cols-[minmax(0,1fr)_240px_auto]"
      >
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
          Bạn muốn khám phá đâu?
          <input
            name="q"
            type="search"
            maxLength={100}
            defaultValue={q}
            placeholder="Tìm tour, ví dụ: Đà Nẵng"
            className="field mt-2"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
          Loại trải nghiệm
          <select
            name="category"
            defaultValue={category}
            className="field mt-2"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button-primary self-end">
          <Icon name="search" className="h-4 w-4" /> Tìm chuyến đi
        </button>
      </form>
      {result && <div className="mb-8"><CatalogNotice meta={result.meta} /></div>}
      {loading ? (
        <div
          role="status"
          aria-label="Đang tìm các chuyến đi…"
          className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
        >
          {[0, 1, 2, 3, 4, 5].map((key) => <div key={key} className="skeleton h-[380px]" />)}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="card p-8"
        >
          <p>{error}</p>
          <div className="mt-4 flex gap-5">
            <button
              className="text-emerald-800 underline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Thử lại
            </button>
            <Link href="/explore" className="text-emerald-800 underline">
              Xóa bộ lọc
            </Link>
          </div>
        </div>
      ) : (
        result && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4 text-sm text-stone-500">
              <p aria-live="polite">
                {result.pagination.total} chuyến đi{q ? ` cho “${q}”` : ""}
              </p>
              <div className="flex items-center gap-4">
                {(q || category) && (
                  <Link href="/explore" className="text-emerald-800 underline">
                    Xóa bộ lọc
                  </Link>
                )}
                <div className="flex rounded-full border border-stone-200 bg-white p-1 shadow-sm">
                  <Link
                    href={viewUrl("grid")}
                    aria-current={view === "grid" ? "true" : undefined}
                    className={`rounded-full px-4 py-1.5 text-xs transition ${view === "grid" ? "bg-emerald-800 font-semibold text-white" : "hover:text-emerald-800"}`}
                  >
                    Dạng thẻ
                  </Link>
                  <Link
                    href={viewUrl("table")}
                    aria-current={view === "table" ? "true" : undefined}
                    className={`rounded-full px-4 py-1.5 text-xs transition ${view === "table" ? "bg-emerald-800 font-semibold text-white" : "hover:text-emerald-800"}`}
                  >
                    Dạng bảng
                  </Link>
                </div>
              </div>
            </div>
            {result.data.length ? (
              view === "grid" ? (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {result.data.map((tour) => (
                    <TourCard key={tour.id} tour={tour} />
                  ))}
                </div>
              ) : (
                <div className="card overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <caption className="sr-only">
                      So sánh các tour du lịch
                    </caption>
                    <thead className="bg-stone-50 text-xs text-stone-500">
                      <tr>
                        {[
                          "Tour",
                          "Danh mục",
                          "Thời lượng",
                          "Giá khởi hành",
                          "Thông tin",
                        ].map((heading) => (
                          <th key={heading} className="px-4 py-4 font-semibold">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.map((tour) => (
                        <tr key={tour.id} className="border-t border-stone-100 transition hover:bg-emerald-50/40">
                          <td className="max-w-xs px-4 py-4">
                            <Link
                              href={`/explore/tours/${tour.id}`}
                              className="font-semibold text-emerald-900 hover:underline"
                            >
                              {tour.name}
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-xs text-stone-600">
                            {tour.category.name}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs">
                            {tour.durationDays
                              ? `${tour.durationDays} ngày`
                              : "Chưa xác nhận"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold">
                            {(tour.priceVnd ?? tour.sourcePriceVnd)
                              ? (tour.priceVnd != null
                                  ? formatVnd
                                  : formatSourcePrice)(
                                  (tour.priceVnd ?? tour.sourcePriceVnd)!,
                                )
                              : "Cần xác nhận"}
                            <span className="mt-1 block text-xs font-normal text-stone-500">
                              {tour.priceVnd != null
                                ? "VNĐ/người · Đã xác nhận"
                                : "Giá nguồn · Chưa xác nhận"}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <Link
                              href={`/explore/tours/${tour.id}`}
                              className="block text-xs font-semibold text-emerald-800 underline"
                            >
                              Chi tiết
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <section className="card border-dashed p-12 text-center">
                <span className="icon-bubble"><Icon name="search" /></span>
                <h2 className="mt-4 text-xl font-semibold">
                  Chưa tìm thấy chuyến đi phù hợp
                </h2>
                <p className="mt-3 text-stone-600">
                  Thử một từ khóa khác hoặc mở rộng danh mục.
                </p>
                <Link
                  href="/explore"
                  className="mt-5 inline-block font-semibold text-emerald-800 underline"
                >
                  Xem tất cả tour
                </Link>
              </section>
            )}
            {result.data.length > 0 && result.pagination.totalPages > 1 && (
              <nav
                aria-label="Phân trang tour"
                className="mt-10 flex items-center justify-center gap-5"
              >
                {result.pagination.page > 1 && (
                  <Link
                    href={pageUrl(result.pagination.page - 1)}
                    className="button-secondary"
                  >
                    ← Trước
                  </Link>
                )}
                <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900">
                  Trang {result.pagination.page} /{" "}
                  {result.pagination.totalPages}
                </span>
                {result.pagination.page < result.pagination.totalPages && (
                  <Link
                    href={pageUrl(result.pagination.page + 1)}
                    className="button-secondary"
                  >
                    Tiếp →
                  </Link>
                )}
              </nav>
            )}
          </>
        )
      )}
    </main>
  );
}
