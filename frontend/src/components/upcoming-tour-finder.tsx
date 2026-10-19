"use client";
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import type { TourSuggestion } from "@/lib/planner";
import type { CatalogMeta } from "@/lib/explore";
import { TourSuggestions } from "./itinerary";

type Results = { data: TourSuggestion[]; checkedAt: string; meta: CatalogMeta };
export function UpcomingTourFinder() {
  const [fields, setFields] = useState({ destination: "", people: "", days: "", startDate: "" });
  const [query, setQuery] = useState(""), [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; result?: Results; error?: string } | null>(null);
  const key = `${query}:${attempt}`, view = state?.key === key ? state : null;
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<Results>(`explore/upcoming-departures${query ? `?${query}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setState({ key, result }); })
      .catch(() => { if (!controller.signal.aborted) setState({ key, error: "Chưa tải được lịch tour. Bạn thử lại sau một chút nhé." }); });
    return () => controller.abort();
  }, [query, key]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(fields)) if (value.trim()) params.set(name, value.trim());
    setQuery(params.toString()); setAttempt((value) => value + 1);
  }
  return <details className="card mt-7 p-5 sm:p-6">
    <summary className="cursor-pointer text-base font-semibold text-emerald-950">Tìm tour đang mở hoặc sắp khởi hành</summary>
    <p className="mt-3 text-sm leading-6 text-stone-600">Xem lịch tour thực tế trước khi lên kế hoạch. Chỉ lấy lịch đang mở, chưa khởi hành. Bạn có thể tìm ngay cả khi chưa đăng nhập.</p>
    <form onSubmit={search} className="my-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-sm font-semibold">Điểm đến<input className="field mt-2" maxLength={100} placeholder="Tất cả điểm đến" value={fields.destination} onChange={(e) => setFields({ ...fields, destination: e.target.value })} /></label>
      <label className="text-sm font-semibold">Ngày muốn đi<input className="field mt-2" type="date" value={fields.startDate} onChange={(e) => setFields({ ...fields, startDate: e.target.value })} /></label>
      <label className="text-sm font-semibold">Số người<input className="field mt-2" type="number" min={1} max={50} step={1} placeholder="Chưa xác định" value={fields.people} onChange={(e) => setFields({ ...fields, people: e.target.value })} /></label>
      <label className="text-sm font-semibold">Số ngày mong muốn<input className="field mt-2" type="number" min={1} max={14} step={1} placeholder="Không giới hạn" value={fields.days} onChange={(e) => setFields({ ...fields, days: e.target.value })} /></label>
      <button className="button-primary self-end justify-center" type="submit">Tìm lịch tour</button>
    </form>
    <p className="mb-4 text-xs leading-6 text-stone-500">Ưu tiên gần ngày bạn chọn, sau đó gần số ngày mong muốn. Số ngày là tiêu chí sắp xếp; thời lượng thực tế vẫn được ghi rõ.</p>
    <div aria-live="polite" aria-busy={!view}>
      {!view ? <p role="status" className="rounded-xl bg-stone-50 p-4 text-sm">Đang tìm lịch tour đang mở…</p> : view.error ? <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm"><p>{view.error}</p><button type="button" className="mt-3 font-semibold underline" onClick={() => setAttempt((value) => value + 1)}>Thử lại</button></div> : view.result && <>
        {view.result.meta.developmentData && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs leading-6">Đang dùng catalog local. Lịch tour, giá và số chỗ cần đối chiếu với đơn vị cung cấp.</p>}
        <TourSuggestions quotes={view.result.data} />
        <p className="mt-3 text-xs leading-6 text-stone-500">Đối chiếu lịch trong hệ thống: {new Date(view.result.checkedAt).toLocaleString("vi-VN")}. Chưa giữ chỗ hoặc xác nhận đặt tour.</p>
      </>}
    </div>
  </details>;
}
