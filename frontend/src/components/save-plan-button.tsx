"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { tripError, tripsFetch } from "@/lib/trips";

export function SavePlanButton({ draftId, hasPlan = true, generating = false }: { draftId?: string; hasPlan?: boolean; generating?: boolean }) {
  const { user } = useAuth();
  const [savedId, setSavedId] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function save() {
    if (!draftId || !user || busy) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError("");
    try {
      const result = await tripsFetch<{ data: { id: string } }>("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId }), signal: controller.signal });
      if (!controller.signal.aborted) setSavedId(result.data.id);
    } catch (err) { if (!controller.signal.aborted) setError(tripError(err)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className={`mb-5 rounded-2xl border p-5 text-sm text-stone-800 ${hasPlan ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-white"}`}>
    <h3 className="font-semibold">{savedId ? "Chuyến đi đã được lưu" : hasPlan ? "Lịch đã sẵn sàng — lưu lại để xem và chỉnh sửa" : "Giữ lại kế hoạch của bạn"}</h3>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {savedId ? <p role="status">Đã lưu vào tài khoản. <Link className="font-semibold text-emerald-800 underline" href={`/my-trips/${savedId}`}>Mở lịch đã lưu →</Link></p> : <button type="button" className="button-primary min-h-11 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" disabled={busy || generating || !user || !draftId} onClick={() => void save()}>{busy ? "Đang lưu…" : "Lưu vào chuyến đi của tôi"}</button>}
      <Link href="/my-trips" className="font-semibold text-emerald-800 underline">Xem chuyến đi của tôi</Link>
    </div>
    {!user ? <p className="mt-3 text-xs leading-6"><Link href="/login" className="font-semibold text-emerald-800 underline">Đăng nhập</Link> để lưu lịch trình vào tài khoản.</p>
      : generating ? <p className="mt-3 text-xs leading-6">AI đang tạo lịch trình. Bạn có thể lưu sau khi kết quả hoàn tất.</p>
      : !hasPlan ? <p className="mt-3 text-xs leading-6">Bấm “Tạo lịch trình” và chờ kết quả thành công để bật nút lưu.</p>
      : !draftId ? <p className="mt-3 text-xs leading-6">Lịch này chưa sẵn sàng để lưu. Bạn hãy tạo lại lịch trình nhé.</p> : !savedId ? <p className="mt-3 text-xs leading-6">Lịch chưa được lưu vào tài khoản. Lưu lại trước khi rời trang để xem và chỉnh sửa sau.</p> : null}
    {error && <p role="alert" className="mt-3 text-red-800">{error}</p>}
  </div>;
}
