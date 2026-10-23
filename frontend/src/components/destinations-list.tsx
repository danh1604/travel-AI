"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ExploreTabs } from "./explore-tabs";
import { Icon } from "./icon";
import { kindLabels, serviceKinds, travelApi, type DestinationSummary } from "@/lib/travel";

export function DestinationsList() {
  const [state, setState] = useState<{ key: number; data?: DestinationSummary[]; error?: boolean } | null>(null), [attempt, setAttempt] = useState(0);
  const view = state?.key === attempt ? state : null;
  useEffect(() => {
    const controller = new AbortController();
    travelApi.destinations(controller.signal)
      .then((r) => { if (!controller.signal.aborted) setState({ key: attempt, data: r.data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ key: attempt, error: true }); });
    return () => controller.abort();
  }, [attempt]);
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8 sm:py-14">
      <p className="eyebrow">Khám phá</p>
      <h1 className="display-type mt-3 text-4xl sm:text-5xl">Điểm đến</h1>
      <p className="mt-4 max-w-2xl text-stone-600">Chọn một nơi để xem khách sạn, nhà hàng, điểm tham quan và phương tiện đang có.</p>
      <div className="mb-8 mt-8"><ExploreTabs active="destinations" /></div>
      {view?.error ? (
        <div role="alert" className="card p-8"><p>Chưa tải được danh sách điểm đến.</p><button className="button-secondary mt-4" onClick={() => setAttempt((v) => v + 1)}>Thử lại</button></div>
      ) : !view?.data ? (
        <div role="status" aria-label="Đang tải…" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="skeleton h-64" />)}</div>
      ) : view.data.length === 0 ? (
        <section className="card border-dashed p-12 text-center"><span className="icon-bubble"><Icon name="pin" /></span><h2 className="mt-4 text-xl font-semibold">Chưa có điểm đến nào</h2></section>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {view.data.map((item) => (
            <Link key={item.id} href={`/destinations/${item.slug}`} className="group card relative flex flex-col overflow-hidden p-6 transition hover:-translate-y-1 hover:shadow-lg">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-orange-300" />
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><Icon name="pin" className="h-3.5 w-3.5" />{item.province}</p>
              <h2 className="display-type mt-2 text-2xl">{item.name}</h2>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-600">{item.description}</p>
              {!!item.tags?.length && <ul className="mt-3 flex flex-wrap gap-1.5 text-xs text-emerald-800">{item.tags.map((tag) => <li key={tag} className="rounded-full bg-emerald-50 px-2.5 py-1">#{tag}</li>)}</ul>}
              <ul className="mt-5 grid grid-cols-2 gap-2 border-t border-dashed border-stone-200 pt-4 text-xs text-stone-600">
                {serviceKinds.map((kind) => <li key={kind}><span className="font-bold text-stone-900">{item.counts[kind]}</span> {kindLabels[kind].plural.toLowerCase()}</li>)}
              </ul>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">Xem điểm đến <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
