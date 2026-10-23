"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExploreTabs } from "./explore-tabs";
import { Icon } from "./icon";
import { ServiceCard } from "./service-card";
import { kindLabels, travelApi, type DestinationSummary, type ServiceKind, type ServiceList } from "@/lib/travel";

export function ServiceBrowser({ kind }: { kind: ServiceKind }) {
  const params = useSearchParams(), router = useRouter(), label = kindLabels[kind];
  const destination = params.get("destination") ?? "", q = params.get("q") ?? "", tag = params.get("tag") ?? "";
  const maxPrice = params.get("maxPrice") ?? "", sort = params.get("sort") === "name" ? "name" : "price", page = params.get("page") ?? "1";
  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [state, setState] = useState<{ key: string; result?: ServiceList; error?: boolean } | null>(null), [attempt, setAttempt] = useState(0);
  const key = `${kind}|${destination}|${q}|${tag}|${maxPrice}|${sort}|${page}|${attempt}`, view = state?.key === key ? state : null;
  useEffect(() => {
    const controller = new AbortController();
    void travelApi.destinations(controller.signal).then((r) => setDestinations(r.data)).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController(), query = new URLSearchParams({ sort, page, limit: "12" });
    if (destination) query.set("destination", destination);
    if (q) query.set("q", q);
    if (tag) query.set("tag", tag);
    if (maxPrice) query.set("maxPrice", maxPrice);
    travelApi.services(kind, query, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setState({ key, result }); })
      .catch(() => { if (!controller.signal.aborted) setState({ key, error: true }); });
    return () => controller.abort();
  }, [kind, destination, q, tag, maxPrice, sort, page, key]);
  function go(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [name, value] of Object.entries(next)) { if (value) query.set(name, value); else query.delete(name); }
    query.delete("page");
    router.push(`/explore/${kind}${query.size ? `?${query}` : ""}`);
  }
  const pageUrl = (next: number) => { const query = new URLSearchParams(params.toString()); query.set("page", String(next)); return `/explore/${kind}?${query}`; };
  const result = view?.result;
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14">
      <p className="eyebrow">Khám phá</p>
      <h1 className="display-type mt-3 text-4xl sm:text-5xl">{label.plural}</h1>
      <p className="mt-4 max-w-2xl text-stone-600">Dữ liệu do PickYourWay quản lý, dùng để tham khảo khi lên kế hoạch và tính ngân sách. Giá có thể thay đổi theo mùa.</p>
      <div className="mb-8 mt-8"><ExploreTabs active={kind} /></div>
      <form
        key={`${destination}:${q}:${tag}:${maxPrice}:${sort}`}
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          go({ q: String(values.get("q") ?? "").trim(), destination: String(values.get("destination") ?? ""), tag, maxPrice: String(values.get("maxPrice") ?? "").replace(/\D/g, ""), sort: String(values.get("sort") ?? "price") });
        }}
        className="card mb-8 grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_1fr_1fr_1fr_auto]"
      >
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">Tìm kiếm<input name="q" type="search" maxLength={100} defaultValue={q} placeholder={`Tìm ${label.singular}…`} className="field mt-2 normal-case tracking-normal" /></label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">Điểm đến
          <select name="destination" defaultValue={destination} className="field mt-2 normal-case tracking-normal"><option value="">Tất cả</option>{destinations.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select></label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">Giá tối đa (₫)<input name="maxPrice" inputMode="numeric" maxLength={12} defaultValue={maxPrice} placeholder="Ví dụ: 800000" className="field mt-2 normal-case tracking-normal" /></label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">Sắp xếp
          <select name="sort" defaultValue={sort} className="field mt-2 normal-case tracking-normal"><option value="price">Giá thấp đến cao</option><option value="name">Tên A–Z</option></select></label>
        <button type="submit" className="button-primary self-end"><Icon name="search" className="h-4 w-4" /> Lọc</button>
      </form>
      {!!result?.facets.tags.length && (
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Lọc theo thẻ">
          {result.facets.tags.map((item) => <button key={item} type="button" aria-pressed={item === tag} onClick={() => go({ tag: item === tag ? "" : item })} className={`chip ${item === tag ? "!border-emerald-600 !bg-emerald-50 !text-emerald-900" : ""}`}>#{item}</button>)}
        </div>
      )}
      {view?.error ? (
        <div role="alert" className="card p-8"><p>Chưa tải được danh sách. Vui lòng thử lại sau ít phút.</p><button className="button-secondary mt-4" onClick={() => setAttempt((v) => v + 1)}>Thử lại</button></div>
      ) : !result ? (
        <div role="status" aria-label="Đang tải…" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="skeleton h-72" />)}</div>
      ) : (
        <>
          <p aria-live="polite" className="mb-5 text-sm text-stone-500">{result.pagination.total} {label.singular}{(q || destination || tag || maxPrice) && <> · <Link href={`/explore/${kind}`} className="text-emerald-800 underline">Xóa bộ lọc</Link></>}</p>
          {result.data.length ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{result.data.map((item) => <ServiceCard key={item.id} kind={kind} item={item} />)}</div>
          ) : (
            <section className="card border-dashed p-12 text-center"><span className="icon-bubble"><Icon name="search" /></span><h2 className="mt-4 text-xl font-semibold">Chưa có kết quả phù hợp</h2><p className="mt-3 text-stone-600">Thử đổi từ khóa, tăng mức giá tối đa hoặc chọn điểm đến khác.</p></section>
          )}
          {result.pagination.totalPages > 1 && (
            <nav aria-label="Phân trang" className="mt-10 flex items-center justify-center gap-5">
              {result.pagination.page > 1 && <Link href={pageUrl(result.pagination.page - 1)} className="button-secondary">← Trước</Link>}
              <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900">Trang {result.pagination.page} / {result.pagination.totalPages}</span>
              {result.pagination.page < result.pagination.totalPages && <Link href={pageUrl(result.pagination.page + 1)} className="button-secondary">Tiếp →</Link>}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
