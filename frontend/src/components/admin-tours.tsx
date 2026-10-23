"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  adminFetch,
  adminError,
  catalogSlug,
  type AdminCategory,
  type AdminData,
  type AdminTour,
  type RefreshResult,
} from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/explore";
import { Icon } from "./icon";

const PAGE_SIZE = 15;
const vnToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
type Filter = "all" | "visible" | "hidden" | "stale";
const filters: [Filter, string][] = [
  ["all", "Tất cả"],
  ["visible", "Đang hiển thị"],
  ["hidden", "Đang ẩn"],
  ["stale", "Hết lịch sắp tới"],
];
// A tour is "stale" when it has recorded departures but none left to book.
const isStale = (tour: AdminTour) => (tour.upcomingDepartures ?? 0) === 0 && (tour.totalDepartures ?? 0) > 0;

function TourForm({ tour, categories, busy, save, cancel }: { tour: AdminTour | null; categories: AdminCategory[]; busy: boolean; save: (fields: Omit<AdminTour, "id" | "revision" | "needsReview">) => void; cancel: () => void }) {
  const [name, setName] = useState(tour?.name ?? ""), [slug, setSlug] = useState(tour?.slug ?? ""), [slugTouched, setSlugTouched] = useState(Boolean(tour));
  const [categoryId, setCategoryId] = useState(tour?.categoryId ?? categories[0]?.id ?? ""), [departure, setDeparture] = useState(tour?.departureLocation ?? "");
  const [days, setDays] = useState(tour?.durationDays?.toString() ?? ""), [visible, setVisible] = useState(tour ? tour.status === "active" : true);
  function submit(event: FormEvent) {
    event.preventDefault();
    save({ name, slug, status: visible ? "active" : "inactive", categoryId, departureLocation: departure, durationDays: days === "" ? null : Number(days) });
  }
  return (
    <form onSubmit={submit} className="admin-card p-5 sm:p-6 xl:sticky xl:top-24" aria-label={tour ? "Sửa tour" : "Tạo tour"}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{tour ? "Sửa tour" : "Tạo tour mới"}</h2>
        <button type="button" onClick={cancel} disabled={busy} aria-label="Đóng" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-stone-100"><Icon name="close" className="h-4 w-4" /></button>
      </div>
      <fieldset disabled={busy} className="mt-5 space-y-4 disabled:opacity-60">
        <label className="block text-sm font-medium">Tên tour
          <input className="field mt-2" required minLength={2} maxLength={200} value={name} onChange={(event) => { setName(event.target.value); if (!slugTouched) setSlug(catalogSlug(event.target.value)); }} />
        </label>
        <label className="block text-sm font-medium">Danh mục
          <select className="field mt-2" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="" disabled>Chọn danh mục</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.status === "inactive" ? " (đang ẩn)" : ""}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <label className="block text-sm font-medium">Điểm khởi hành
            <input className="field mt-2" required minLength={2} maxLength={200} value={departure} onChange={(event) => setDeparture(event.target.value)} />
          </label>
          <label className="block text-sm font-medium">Số ngày
            <input className="field mt-2" type="number" min={1} max={365} step={1} value={days} onChange={(event) => setDays(event.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-3 rounded-xl bg-stone-50 p-3 text-sm font-medium">
          <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
          Hiển thị trên trang khách hàng
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-stone-500">Tùy chọn nâng cao</summary>
          <label className="mt-3 block font-medium">Đường dẫn (slug)
            <input className="field mt-2" required maxLength={200} pattern="[a-z0-9]+(-[a-z0-9]+)*" title="Chữ thường không dấu, số và dấu gạch ngang" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(event.target.value); }} />
          </label>
        </details>
        <button type="submit" className="button-primary w-full">{busy ? "Đang lưu…" : "Lưu"}</button>
      </fieldset>
    </form>
  );
}

type RefreshState = { tourId?: string; tourName?: string; startDate: string; gapDays: string; preview: RefreshResult | null; busy: boolean; error: string };
function RefreshPanel({ state, setState, onApplied, onClose }: { state: RefreshState; setState: (next: RefreshState) => void; onApplied: (result: RefreshResult) => void; onClose: () => void }) {
  const body = (dryRun: boolean) => JSON.stringify({ startDate: state.startDate, gapDays: Number(state.gapDays), dryRun, ...(state.tourId ? { tourId: state.tourId } : {}) });
  const edit = (patch: Partial<RefreshState>) => setState({ ...state, preview: null, error: "", ...patch });
  async function run(dryRun: boolean) {
    setState({ ...state, busy: true, error: "" });
    try {
      const result = await adminFetch<RefreshResult>("departures/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(dryRun) });
      if (dryRun) setState({ ...state, busy: false, error: "", preview: result });
      else onApplied(result);
    } catch (reason) { setState({ ...state, busy: false, error: adminError(reason) }); }
  }
  const preview = state.preview, shown = preview?.tours.flatMap((tour) => tour.changes.map((change) => ({ tour: tour.name, ...change }))).slice(0, 8) ?? [];
  return (
    <section className="admin-card mb-6 border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white p-5 sm:p-6" aria-labelledby="refresh-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="refresh-title" className="text-lg font-semibold">Làm mới lịch khởi hành cũ</h2>
          <p className="mt-1 text-sm text-stone-600">{state.tourId ? <>Áp dụng cho tour <strong>{state.tourName}</strong>.</> : <>Áp dụng cho <strong>mọi tour đang hiển thị</strong> có lịch đã qua.</>} <strong>Toàn bộ</strong> lịch cũ được dời sang ngày mới theo đúng thứ tự, giữ nguyên giờ đi, số ngày và giá.</p>
        </div>
        <button type="button" onClick={onClose} disabled={state.busy} aria-label="Đóng" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white"><Icon name="close" className="h-4 w-4" /></button>
      </div>
      <fieldset disabled={state.busy} className="mt-4 grid gap-4 disabled:opacity-60 sm:grid-cols-2">
        <label className="block text-sm font-medium">Ngày đi đầu tiên
          <input className="field mt-2" type="date" min={vnToday()} value={state.startDate} onChange={(event) => edit({ startDate: event.target.value })} />
        </label>
        <label className="block text-sm font-medium">Cách nhau (ngày)
          <input className="field mt-2" type="number" min={1} max={90} value={state.gapDays} onChange={(event) => edit({ gapDays: event.target.value })} />
        </label>
      </fieldset>
      {state.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-900">{state.error}</p>}
      {preview && (
        <div className="mt-5" role="status">
          {preview.summary.tours === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-stone-600">Không có lịch cũ nào để làm mới.</p>
          ) : (
            <>
              <p className="text-sm font-semibold">Sẽ cập nhật {preview.summary.moved + preview.summary.cloned} lịch của {preview.summary.tours} tour{preview.summary.cloned > 0 && <span className="font-normal text-stone-600"> · {preview.summary.cloned} lịch đã có khách được giữ nguyên làm lịch sử và tạo bản mới</span>}</p>
              <ul className="mt-3 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white text-sm">
                {shown.map((item) => (
                  <li key={item.departureId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="min-w-0 truncate font-medium">{item.tour}</span>
                    <span className="whitespace-nowrap text-xs text-stone-600">{formatDate(item.from)} → <strong className="text-emerald-800">{formatDate(item.to)}</strong>{item.action === "clone" && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">tạo bản mới</span>}</span>
                  </li>
                ))}
              </ul>
              {preview.summary.moved + preview.summary.cloned > shown.length && <p className="mt-2 text-xs text-stone-500">…và {preview.summary.moved + preview.summary.cloned - shown.length} lịch khác.</p>}
            </>
          )}
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="button-secondary" disabled={state.busy || !state.startDate} onClick={() => void run(true)}>{state.busy && !preview ? "Đang tính…" : "Xem trước"}</button>
        <button type="button" className="button-primary" disabled={state.busy || !preview || preview.summary.tours === 0} onClick={() => void run(false)}>{state.busy && preview ? "Đang áp dụng…" : "Áp dụng"}</button>
      </div>
    </section>
  );
}

export function AdminTours() {
  const [data, setData] = useState<AdminData | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState(""), [filter, setFilter] = useState<Filter>("all"), [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ tour: AdminTour | null } | null>(null), [busy, setBusy] = useState(false), [pendingId, setPendingId] = useState("");
  const [refresh, setRefresh] = useState<RefreshState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set()), [confirmDelete, setConfirmDelete] = useState<string[] | null>(null), [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void adminFetch<AdminData>("catalog", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setData(result); setError(""); } })
      .catch((reason) => { if (!controller.signal.aborted) { setData(null); setError(adminError(reason)); } });
    return () => controller.abort();
  }, [attempt]);
  const reload = () => setAttempt((value) => value + 1);
  async function send(tour: AdminTour | null, fields: Omit<AdminTour, "id" | "revision" | "needsReview">) {
    const result = await adminFetch<{ data: AdminTour }>(tour ? `tours/${tour.id}` : "tours", { method: tour ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tour ? { ...fields, revision: tour.revision } : fields) });
    setData((current) => current && { ...current, tours: tour ? current.tours.map((item) => (item.id === tour.id ? { ...item, ...result.data } : item)) : [...current.tours, { ...result.data, upcomingDepartures: 0, totalDepartures: 0 }] });
    return result.data;
  }
  async function saveForm(fields: Omit<AdminTour, "id" | "revision" | "needsReview">) {
    if (busy || !editor) return;
    setBusy(true); setError(""); setNotice("");
    try { const saved = await send(editor.tour, fields); setEditor(null); setNotice(`Đã lưu “${saved.name}”.`); }
    catch (reason) { setError(adminError(reason)); } finally { setBusy(false); }
  }
  async function toggle(tour: AdminTour) {
    if (pendingId) return;
    setPendingId(tour.id); setError(""); setNotice("");
    try {
      const saved = await send(tour, { name: tour.name, slug: tour.slug, status: tour.status === "active" ? "inactive" : "active", categoryId: tour.categoryId, departureLocation: tour.departureLocation, durationDays: tour.durationDays });
      setNotice(saved.status === "active" ? `Đã hiển thị “${saved.name}” trên trang khách hàng.` : `Đã ẩn “${saved.name}”.`);
    } catch (reason) { setError(adminError(reason)); } finally { setPendingId(""); }
  }
  async function removeTours(ids: string[]) {
    if (deleting || !data) return;
    setDeleting(true); setError(""); setNotice("");
    const removed = new Set<string>(); let blocked = 0, failed = "";
    for (const tourId of ids) {
      const tour = data.tours.find((item) => item.id === tourId);
      if (!tour) continue;
      try {
        await adminFetch(`tours/${tour.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: tour.revision }) });
        removed.add(tour.id);
      } catch (reason) {
        if (reason instanceof ApiError && reason.code === "tour_has_upcoming_guests") blocked++;
        else { failed = adminError(reason); break; }
      }
    }
    setData((current) => current && { ...current, tours: current.tours.filter((item) => !removed.has(item.id)) });
    setSelected((current) => new Set([...current].filter((item) => !removed.has(item))));
    setEditor((current) => (current?.tour && removed.has(current.tour.id) ? null : current));
    setConfirmDelete(null); setDeleting(false);
    if (removed.size) setNotice(`Đã xóa ${removed.size} tour.${blocked ? ` ${blocked} tour có khách sắp đi nên được giữ lại.` : ""}`);
    else if (blocked) setError(adminError(new ApiError(409, "tour_has_upcoming_guests")));
    if (failed) setError(failed);
  }
  function openRefresh(tour?: AdminTour) {
    setNotice(""); setError(""); setEditor(null);
    setRefresh({ tourId: tour?.id, tourName: tour?.name, startDate: vnToday(), gapDays: "7", preview: null, busy: false, error: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const tours = data?.tours ?? [], categoryNames = new Map((data?.categories ?? []).map((category) => [category.id, category.name]));
  const stats = { total: tours.length, visible: tours.filter((tour) => tour.status === "active").length, upcoming: tours.filter((tour) => (tour.upcomingDepartures ?? 0) > 0).length, stale: tours.filter((tour) => tour.status === "active" && isStale(tour)).length };
  const rows = tours.filter((tour) => (filter === "all" || (filter === "visible" && tour.status === "active") || (filter === "hidden" && tour.status === "inactive") || (filter === "stale" && isStale(tour)))
    && catalogSlug(`${tour.name} ${tour.slug} ${tour.departureLocation}`).includes(catalogSlug(q))).sort((a, b) => a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id));
  const pageIds = (list: AdminTour[]) => list.map((tour) => tour.id), allSelected = (list: AdminTour[]) => list.length > 0 && list.every((tour) => selected.has(tour.id));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), current = Math.min(page, pages), visibleRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Quản trị</p>
          <h1 className="display-type mt-3">Quản lý tour</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="button-secondary" onClick={() => openRefresh()} disabled={!data}><Icon name="calendar" className="h-4 w-4" /> Làm mới lịch cũ</button>
          <button type="button" className="button-primary" disabled={!data?.categories.length} onClick={() => { setRefresh(null); setEditor({ tour: null }); setNotice(""); setError(""); }}>+ Tạo tour</button>
        </div>
      </div>
      {notice && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
      {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error} <button type="button" className="ml-2 font-semibold underline" onClick={reload}>Tải lại</button></div>}
      {!data ? (!error && <p role="status" className="mt-8 text-sm text-stone-500">Đang kiểm tra quyền và tải danh sách tour…</p>) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {([["Tổng số tour", stats.total], ["Đang hiển thị", stats.visible], ["Còn lịch sắp tới", stats.upcoming], ["Hiển thị nhưng hết lịch", stats.stale]] as const).map(([label, value]) => (
              <div key={label} className="admin-card px-5 py-4"><dt className="text-xs text-stone-500">{label}</dt><dd className={`mt-1 text-2xl font-bold ${label === "Hiển thị nhưng hết lịch" && value > 0 ? "text-amber-600" : ""}`}>{value}</dd></div>
            ))}
          </dl>
          {stats.stale > 0 && !refresh && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
              <p><strong>{stats.stale} tour</strong> đang hiển thị nhưng chưa có lịch khởi hành sắp tới nên khách không đặt được.</p>
              <button type="button" className="font-semibold underline" onClick={() => openRefresh()}>Làm mới lịch ngay</button>
            </div>
          )}
          <div className="mt-6">{refresh && <RefreshPanel state={refresh} setState={setRefresh} onClose={() => setRefresh(null)} onApplied={(result) => { setRefresh(null); setNotice(`Đã làm mới ${result.summary.moved + result.summary.cloned} lịch của ${result.summary.tours} tour.`); reload(); }} />}</div>
          <div className={`grid items-start gap-6 ${editor ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
            <section className="admin-card min-w-0 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="relative min-w-52 flex-1"><span className="sr-only">Tìm tour</span>
                  <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input className="field pl-10" type="search" placeholder="Tìm theo tên hoặc điểm khởi hành…" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} />
                </label>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc tour">
                  {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className="admin-pill" onClick={() => { setFilter(value); setPage(1); }} {...(filter === value ? { "aria-current": "page" } : {})}>{label}</button>)}
                </div>
              </div>
              {visibleRows.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <label className="flex items-center gap-2 text-stone-600">
                    <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={allSelected(visibleRows)} onChange={(event) => setSelected((current) => { const next = new Set(current); for (const id of pageIds(visibleRows)) { if (event.target.checked) next.add(id); else next.delete(id); } return next; })} />
                    Chọn tất cả trên trang này
                  </label>
                  {selected.size > 0 && <button type="button" className="admin-action text-red-700" disabled={deleting} onClick={() => setConfirmDelete([...selected])}>Xóa {selected.size} tour đã chọn</button>}
                </div>
              )}
              {confirmDelete && (
                <div role="alertdialog" aria-labelledby="delete-title" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
                  <p id="delete-title" className="font-semibold">Xóa vĩnh viễn {confirmDelete.length === 1 ? `“${tours.find((tour) => tour.id === confirmDelete[0])?.name ?? "tour"}”` : `${confirmDelete.length} tour`}?</p>
                  <p className="mt-1 leading-6">Lịch trình, ảnh, lịch khởi hành và đánh giá của tour sẽ bị xóa và <strong>không thể khôi phục</strong>. Tour có lịch sắp đi đã có khách sẽ được giữ lại. Nếu chỉ muốn khách không thấy tour, hãy chọn “Ẩn” thay vì xóa.</p>
                  <div className="mt-3 flex gap-3">
                    <button type="button" disabled={deleting} className="rounded-full bg-red-700 px-5 py-2 font-semibold text-white disabled:opacity-60" onClick={() => void removeTours(confirmDelete)}>{deleting ? "Đang xóa…" : "Xóa vĩnh viễn"}</button>
                    <button type="button" disabled={deleting} className="button-secondary min-h-10 py-2" onClick={() => setConfirmDelete(null)}>Giữ lại</button>
                  </div>
                </div>
              )}
              <ul className="divide-y divide-stone-100">
                {visibleRows.map((tour) => {
                  const upcoming = tour.upcomingDepartures ?? 0, total = tour.totalDepartures ?? 0, active = tour.status === "active";
                  return (
                    <li key={tour.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
                      <input type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-600" aria-label={`Chọn ${tour.name}`} checked={selected.has(tour.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(tour.id); else next.delete(tour.id); return next; })} />
                      <div className="min-w-0 flex-1 basis-64">
                        <p className="font-semibold leading-snug">{tour.name}</p>
                        <p className="mt-1 text-xs text-stone-500">{categoryNames.get(tour.categoryId) ?? "Chưa có danh mục"} · Từ {tour.departureLocation}{tour.durationDays ? ` · ${tour.durationDays} ngày` : ""}</p>
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          {upcoming > 0 ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">{upcoming} lịch sắp tới</span>
                            : total > 0 ? <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">Lịch đã cũ</span>
                            : <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-600">Chưa có lịch</span>}
                          {tour.needsReview && <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">Cần rà soát</span>}
                          {upcoming === 0 && total > 0 && <button type="button" className="font-semibold text-emerald-800 underline" onClick={() => openRefresh(tour)}>Làm mới lịch</button>}
                        </p>
                      </div>
                      <button type="button" role="switch" aria-checked={active} aria-label={`${active ? "Ẩn" : "Hiển thị"} ${tour.name}`} disabled={Boolean(pendingId)} onClick={() => void toggle(tour)} className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${active ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-stone-50 text-stone-500"}`}>
                        <span aria-hidden="true" className={`relative h-4 w-7 rounded-full transition ${active ? "bg-emerald-500" : "bg-stone-300"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${active ? "left-3.5" : "left-0.5"}`} /></span>
                        {pendingId === tour.id ? "Đang lưu…" : active ? "Hiển thị" : "Đang ẩn"}
                      </button>
                      <div className="flex shrink-0 gap-2">
                        <Link className="admin-action" href={`/admin/tours/${tour.id}/departures`}>Lịch khởi hành</Link>
                        <Link className="admin-action" href={`/admin/tours/${tour.id}/content`}>Nội dung</Link>
                        <button type="button" className="admin-action" disabled={busy} onClick={() => { setRefresh(null); setEditor({ tour }); setError(""); setNotice(""); }}>Sửa</button>
                        <button type="button" className="admin-action text-red-700" disabled={deleting} aria-label={`Xóa ${tour.name}`} onClick={() => setConfirmDelete([tour.id])}>Xóa</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {!visibleRows.length && <p className="py-10 text-center text-sm text-stone-500">Không có tour nào phù hợp.</p>}
              {pages > 1 && (
                <nav aria-label="Phân trang" className="mt-4 flex items-center justify-between gap-3 border-t border-stone-100 pt-4 text-xs">
                  <button type="button" className="admin-action" disabled={current <= 1} onClick={() => setPage(current - 1)}>Trước</button>
                  <span>Trang {current}/{pages} · {rows.length} tour</span>
                  <button type="button" className="admin-action" disabled={current >= pages} onClick={() => setPage(current + 1)}>Sau</button>
                </nav>
              )}
            </section>
            {editor && <TourForm key={editor.tour ? `${editor.tour.id}:${editor.tour.revision}` : "new"} tour={editor.tour} categories={data.categories} busy={busy} save={(fields) => void saveForm(fields)} cancel={() => setEditor(null)} />}
          </div>
        </>
      )}
    </main>
  );
}
