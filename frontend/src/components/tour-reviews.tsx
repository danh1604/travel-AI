"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { reviewDate, reviewError, reviewsFetch, type Review, type ReviewList } from "@/lib/reviews";

function ReviewEditor({ mine, busy, save, remove }: { mine: Review | null; busy: boolean; save: (rating: number, comment: string) => Promise<void>; remove: () => Promise<void> }) {
  const [rating, setRating] = useState(mine?.rating ?? 0), [comment, setComment] = useState(mine?.comment ?? ""), [confirm, setConfirm] = useState(false);
  function submit(event: FormEvent) { event.preventDefault(); void save(rating, comment); }
  return <form onSubmit={submit} className="my-5 rounded-xl bg-emerald-50 p-5">
    <h3 className="font-semibold">{mine ? "Đánh giá của bạn" : "Chia sẻ đánh giá về tour"}</h3>
    {mine?.hidden && <p className="mt-2 text-sm leading-6 text-amber-900">Đánh giá đang được quản trị viên ẩn. Chỉnh sửa không tự hiển thị lại công khai.</p>}
    <fieldset disabled={busy} className="mt-4 space-y-4 disabled:opacity-60">
      <fieldset><legend className="text-sm font-semibold">Bạn chấm tour bao nhiêu sao?</legend><div className="mt-2 flex flex-wrap gap-3">{[1, 2, 3, 4, 5].map((value) => <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${rating === value ? "border-emerald-700 bg-white font-semibold" : "border-stone-200"}`}><input type="radio" name="tour-rating" value={value} required checked={rating === value} onChange={() => setRating(value)} />{value} ★</label>)}</div></fieldset>
      <label className="block text-sm font-semibold">Nhận xét (không bắt buộc)<textarea rows={4} maxLength={2000} className="field mt-2" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Điều bạn thích hoặc điều khách khác nên cân nhắc về tour…" /><span className="mt-1 block text-xs font-normal text-stone-500">{comment.length}/2.000 ký tự · Không chia sẻ số điện thoại, email hoặc thông tin riêng.</span></label>
      <div className="flex flex-wrap items-center gap-4"><button type="submit" disabled={!rating} className="button-primary disabled:opacity-50">{busy ? "Đang xử lý…" : mine ? "Lưu đánh giá" : "Gửi đánh giá"}</button>{mine && <button type="button" className="text-sm font-semibold text-red-800 underline" onClick={() => setConfirm(true)}>Xóa đánh giá</button>}</div>
      {confirm && <div className="rounded-xl bg-white p-4 text-sm"><p>Xóa đánh giá này? Bạn sẽ cần viết lại nếu muốn chia sẻ lần nữa.</p><div className="mt-3 flex gap-4"><button type="button" className="font-semibold text-red-800 underline" onClick={() => void remove()}>Xác nhận xóa</button><button type="button" onClick={() => setConfirm(false)}>Giữ lại</button></div></div>}
    </fieldset>
  </form>;
}
export function TourReviews({ tourId }: { tourId: string }) {
  const { user, loading } = useAuth();
  return <ReviewPanel key={`${tourId}:${user?.id ?? "guest"}`} tourId={tourId} loggedIn={Boolean(user)} loadingAuth={loading} />;
}
function ReviewPanel({ tourId, loggedIn, loadingAuth }: { tourId: string; loggedIn: boolean; loadingAuth: boolean }) {
  const [page, setPage] = useState(1), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [state, setState] = useState<{ key: string; data?: ReviewList; error?: string } | null>(null);
  const active = useRef<AbortController | null>(null), key = `${page}:${attempt}`, view = state?.key === key ? state : null;
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    void reviewsFetch<ReviewList>(`tours/${tourId}?page=${page}`, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setState({ key, data }); }).catch((err) => { if (!controller.signal.aborted) setState({ key, error: reviewError(err) }); });
    return () => controller.abort();
  }, [tourId, page, key]);
  async function mutate(method: "PUT" | "DELETE", rating?: number, comment?: string) {
    if (busy || !view?.data) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError(""); setNotice("");
    try {
      await reviewsFetch(`tours/${tourId}/mine`, { method, signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(method === "PUT" ? { rating, comment, revision: view.data.mine?.revision ?? 0 } : { revision: view.data.mine?.revision }) });
      if (!controller.signal.aborted) { setPage(1); setAttempt((value) => value + 1); setNotice(method === "PUT" ? "Đã lưu đánh giá của bạn." : "Đã xóa đánh giá."); }
    } catch (err) { if (!controller.signal.aborted) setError(reviewError(err)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section id="tour-reviews" className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
    <h2 className="text-xl font-semibold">Đánh giá & nhận xét</h2>
    <p className="mt-2 text-xs leading-6 text-stone-500">Ý kiến từ tài khoản người dùng; website chưa xác minh người viết đã tham gia tour.</p>
    {notice && <p role="status" className="mt-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    <button type="button" disabled={busy} className="mt-3 text-xs font-semibold text-emerald-800 underline" onClick={() => { setAttempt((value) => value + 1); setError(""); }}>Tải lại đánh giá</button>
    {!view ? <p role="status" className="mt-5 text-sm">Đang tải đánh giá…</p> : view.error ? <p role="alert" className="mt-4 text-sm text-red-800">{view.error}</p> : view.data && <>
      <p className="mt-5 text-lg font-semibold text-emerald-900">{view.data.average === null ? "Chưa có đánh giá công khai" : `${view.data.average.toLocaleString("vi-VN")} / 5 ★ · ${view.data.total} đánh giá`}</p>
      {loadingAuth ? <p className="mt-3 text-sm">Đang kiểm tra tài khoản…</p> : loggedIn ? <ReviewEditor key={`${attempt}:${view.data.mine?.revision ?? 0}`} mine={view.data.mine} busy={busy} save={(rating, comment) => mutate("PUT", rating, comment)} remove={() => mutate("DELETE")} /> : <p className="my-5 text-sm"><Link href="/login" className="font-semibold text-emerald-800 underline">Đăng nhập</Link> để chấm sao và chia sẻ nhận xét.</p>}
      <div className="divide-y divide-stone-100">{view.data.data.map((review) => <article key={review.id} className="py-5"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{review.authorName}</h3><p aria-label={`${review.rating} trên 5 sao`} className="text-sm font-semibold text-amber-700">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p></div><p className="mt-2 text-xs text-stone-500">{reviewDate(review.createdAt)}{review.updatedAt !== review.createdAt ? ` · Cập nhật ${reviewDate(review.updatedAt)}` : ""}</p>{review.comment ? <p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-stone-700">{review.comment}</p> : <p className="mt-3 text-xs text-stone-500">Người dùng chỉ chấm sao.</p>}</article>)}</div>
      {view.data.totalPages > 1 && <nav aria-label="Phân trang đánh giá" className="mt-4 flex flex-wrap items-center gap-4"><button className="button-secondary" disabled={busy || page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</button><span className="text-sm">Trang {page}/{view.data.totalPages}</span><button className="button-secondary" disabled={busy || page >= view.data.totalPages} onClick={() => setPage((value) => value + 1)}>Sau</button></nav>}
    </>}
  </section>;
}
