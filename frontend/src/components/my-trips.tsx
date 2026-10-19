"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { Itinerary } from "./itinerary";
import { SavedTripEditor } from "./saved-trip-editor";
import { tripError, tripsFetch, type SavedTrip, type TripList } from "@/lib/trips";

export function MyTrips({ tripId }: { tripId?: string }) {
  const { user, loading } = useAuth();
  const [page, setPage] = useState(1), [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; list?: TripList; trip?: SavedTrip; error?: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null), [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState("");
  const key = `${user?.id}:${tripId ?? "list"}:${page}:${attempt}`;
  const view = state?.key === key ? state : null;
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const request = tripId ? tripsFetch<{ data: SavedTrip }>(`/${tripId}`, { signal: controller.signal }).then((r) => ({ key, trip: r.data })) : tripsFetch<TripList>(`?page=${page}&limit=12`, { signal: controller.signal }).then((list) => ({ key, list }));
    void request.then((result) => { if (!controller.signal.aborted) setState(result); }).catch((err) => { if (!controller.signal.aborted) setState({ key, error: tripError(err) }); });
    return () => controller.abort();
  }, [user, tripId, page, key]);
  async function remove(id: string) {
    if (deleting || !user) return;
    setDeleting(true); setDeleteError("");
    try {
      await tripsFetch(`/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });
      setConfirm(null); setAttempt((v) => v + 1);
      if (page > 1 && view?.list?.data.length === 1) setPage((v) => v - 1);
    } catch (err) { setDeleteError(tripError(err)); }
    finally { setDeleting(false); }
  }
  return <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
    <p className="eyebrow">My trips</p><h1 className="display-type mt-3 text-4xl sm:text-5xl">{tripId ? "Lịch trình đã lưu" : "Chuyến đi của tôi"}</h1>
    <p className="mt-4 text-sm leading-7 text-stone-600">Lịch trình riêng của tài khoản bạn. Mở lại không cần gọi AI. Giá, số chỗ và thời tiết là dữ liệu tại lúc tạo; cần kiểm tra lại trước khi đi.</p>
    <div className="my-6 flex flex-wrap gap-3"><Link className="button-primary" href="/planner">Tạo lịch trình mới</Link>{tripId && <Link className="button-secondary" href="/my-trips">Về danh sách</Link>}</div>
    {loading ? <p>Đang kiểm tra tài khoản…</p> : !user ? <p className="rounded-xl bg-white p-6"><Link className="font-semibold text-emerald-800 underline" href="/login">Đăng nhập</Link> để xem lịch trình đã lưu.</p> : view?.error ? <div role="alert" className="rounded-xl bg-red-50 p-6 text-sm"><p>{view.error}</p><button className="button-secondary mt-4" onClick={() => setAttempt((v) => v + 1)}>Thử lại</button></div> : !view ? <p role="status">Đang tải lịch trình…</p> : <>
      {view.trip && <><SavedTripEditor key={`${user.id}:${view.trip.id}:${view.trip.revision}`} trip={view.trip} onSaved={(trip) => setState({ key, trip })} onReload={() => setAttempt((v) => v + 1)} /><Itinerary plan={view.trip.plan} /></>}
      {view.list && <>
        <p className="mb-4 text-sm text-stone-500">{view.list.pagination.total} lịch trình đã lưu</p>
        {!view.list.data.length && <section className="card border-dashed p-12 text-center"><span aria-hidden="true" className="icon-bubble h-14 w-14 text-2xl">🧳</span><h2 className="mt-4 text-xl font-semibold">Chưa có lịch trình nào</h2><p className="mt-3 text-sm leading-7 text-stone-500">Tạo kế hoạch ở Planner rồi bấm “Lưu vào My Trips” để giữ lại.</p></section>}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{view.list.data.map((trip) => <article key={trip.id} className="card relative overflow-hidden p-6 pt-8 transition hover:-translate-y-1 hover:shadow-lg">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-orange-300" />
          <h2 className="text-lg font-semibold"><Link className="text-emerald-900" href={`/my-trips/${trip.id}`}>{trip.title}</Link></h2>
          <p className="mt-3 text-sm text-stone-600">{trip.people} người · {trip.startDate ?? "Chưa chọn ngày đi"}</p>
          <p className="mt-2 text-sm">Ngân sách nhóm: {trip.budgetVnd === null ? "Chưa có" : `${new Intl.NumberFormat("vi-VN").format(trip.budgetVnd)} ₫`}</p>
          <p className="mt-2 text-xs text-stone-500">Đã lưu {new Date(trip.savedAt).toLocaleString("vi-VN")}</p>
          <div className="mt-5 flex gap-3"><Link className="button-secondary" href={`/my-trips/${trip.id}`}>Xem lịch trình</Link><button className="text-sm font-semibold text-red-800" disabled={deleting} onClick={() => { setConfirm(trip.id); setDeleteError(""); }}>Xóa</button></div>
          {confirm === trip.id && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm"><p>Xóa lịch trình này khỏi tài khoản? Thao tác không thể hoàn tác.</p><div className="mt-3 flex gap-4"><button className="font-semibold text-red-800" disabled={deleting} onClick={() => void remove(trip.id)}>{deleting ? "Đang xóa…" : "Xác nhận xóa"}</button><button disabled={deleting} onClick={() => setConfirm(null)}>Giữ lại</button></div>{deleteError && <p className="mt-3" role="alert">{deleteError}</p>}</div>}
        </article>)}</div>
        {view.list.pagination.totalPages > 1 && <nav aria-label="Phân trang lịch trình" className="mt-6 flex items-center gap-4"><button className="button-secondary" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>Trước</button><span className="text-sm">Trang {page}/{view.list.pagination.totalPages}</span><button className="button-secondary" disabled={page >= view.list.pagination.totalPages} onClick={() => setPage((v) => v + 1)}>Sau</button></nav>}
      </>}
    </>}
  </main>;
}
