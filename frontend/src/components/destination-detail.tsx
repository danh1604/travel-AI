"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { ExploreTabs } from "./explore-tabs";
import { Icon } from "./icon";
import { ServiceCard } from "./service-card";
import { kindLabels, serviceKinds, travelApi, type DestinationDetail } from "@/lib/travel";

export function DestinationDetailView({ slug }: { slug: string }) {
  const [state, setState] = useState<{ key: string; data?: DestinationDetail; status?: number } | null>(null), [attempt, setAttempt] = useState(0);
  const key = `${slug}:${attempt}`, view = state?.key === key ? state : null;
  useEffect(() => {
    const controller = new AbortController();
    travelApi.destination(slug, controller.signal)
      .then((r) => { if (!controller.signal.aborted) setState({ key, data: r.data }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ key, status: error instanceof ApiError ? error.status : 0 }); });
    return () => controller.abort();
  }, [slug, key]);
  if (view?.status === 404 || view?.status === 400) return (
    <main className="mx-auto max-w-3xl px-6 py-20 text-center"><span className="icon-bubble h-14 w-14"><Icon name="pin" /></span><h1 className="display-type mt-5 text-3xl">Không tìm thấy điểm đến</h1><p className="mt-3 text-stone-600">Điểm đến này không tồn tại hoặc đang được ẩn.</p><Link href="/destinations" className="button-primary mt-6">Xem tất cả điểm đến</Link></main>
  );
  if (view?.status !== undefined) return (
    <main className="mx-auto max-w-3xl px-6 py-20"><div role="alert" className="card p-8"><p>Chưa tải được điểm đến. Vui lòng thử lại sau ít phút.</p><button className="button-secondary mt-4" onClick={() => setAttempt((v) => v + 1)}>Thử lại</button></div></main>
  );
  const data = view?.data;
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14">
      <div className="mb-8"><ExploreTabs active="destinations" /></div>
      {!data ? <div role="status" aria-label="Đang tải…" className="space-y-6"><div className="skeleton h-48" /><div className="skeleton h-72" /></div> : (
        <>
          <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950 p-8 text-white shadow-xl shadow-emerald-950/15 sm:p-12">
            <div aria-hidden="true" className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" />
            <div className="relative">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.18em] text-emerald-200"><Icon name="pin" className="h-4 w-4" />{data.destination.province}</p>
              <h1 className="display-type mt-3 text-4xl sm:text-5xl">{data.destination.name}</h1>
              <p className="mt-4 max-w-2xl text-white/75">{data.destination.description}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/planner?destination=${encodeURIComponent(data.destination.name)}`} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-emerald-900 shadow-lg transition hover:-translate-y-0.5"><Icon name="sparkles" className="h-4 w-4" /> Lập lịch trình đến đây</Link>
                {data.destination.tags?.map((tag) => <span key={tag} className="glass rounded-full px-3.5 py-2 text-xs font-medium">#{tag}</span>)}
              </div>
            </div>
          </section>
          {serviceKinds.map((kind) => (
            <section key={kind} className="mt-14" aria-labelledby={`section-${kind}`}>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <h2 id={`section-${kind}`} className="display-type text-2xl sm:text-3xl">{kindLabels[kind].plural} <span className="text-base font-normal text-stone-400">({data[kind].length})</span></h2>
                {data[kind].length > 0 && <Link href={`/explore/${kind}?destination=${data.destination.slug}`} className="text-sm font-semibold text-emerald-800">Xem và lọc <span aria-hidden="true">↗</span></Link>}
              </div>
              {data[kind].length ? (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{data[kind].slice(0, 6).map((item) => <ServiceCard key={item.id} kind={kind} item={item} />)}</div>
              ) : <p className="card border-dashed p-8 text-center text-sm text-stone-500">Chưa có {kindLabels[kind].singular} nào tại {data.destination.name}.</p>}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
