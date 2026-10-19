"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
type Guide = { id: string; destination: string; name: string; description: string; tags: string[]; checkedAt: string; source: { name: string; url: string }; priceVnd: null; openingHours: null };
export default function GuidesPage() {
  const [data, setData] = useState<Guide[] | null>(null), [destination, setDestination] = useState("");
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<{ data: Guide[] }>("explore/guides", { signal: controller.signal, cache: "no-store" }).then((r) => { if (!controller.signal.aborted) { setData(r.data); setError(false); } }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  const visible = data?.filter((g) => !destination || g.destination === destination);
  return <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
    <p className="eyebrow">ĐIỂM THAM KHẢO / NGUỒN BÊN NGOÀI</p><h1 className="display-type mt-3 text-4xl">Thêm ý tưởng cho hành trình</h1>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600">Thông tin ngắn được đối chiếu từ Traveloka và Vietnam Tourism, có liên kết nguồn và ngày kiểm tra. Đây là gợi ý tham quan, chưa phải sản phẩm tour hoặc xác nhận dịch vụ. Giá vé, giờ mở cửa và điều kiện tham quan cần kiểm tra lại.</p>
    <div className="my-6 flex flex-wrap gap-3"><Link className="button-primary" href="/planner">Lập lịch trình AI</Link><Link className="button-secondary" href="/explore">Về danh sách tour</Link></div>
    {data && <label className="mb-6 block max-w-xs text-sm font-semibold">Điểm đến<select className="field mt-2" value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">Tất cả điểm đến ({data.length})</option>{Array.from(new Set(data.map((g) => g.destination))).sort().map((d) => <option key={d}>{d}</option>)}</select></label>}
    {error ? <div role="alert"><p>Chưa tải được dữ liệu nguồn.</p><button className="button-secondary mt-3" onClick={() => setAttempt((v) => v + 1)}>Thử lại</button></div> : !data ? <p role="status">Đang tải điểm tham khảo…</p> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visible?.map((g) => <article key={g.id} className="rounded-2xl border border-stone-200 bg-white p-6"><p className="text-xs font-semibold text-emerald-700">{g.destination}</p><h2 className="mt-2 text-xl font-semibold">{g.name}</h2><p className="mt-3 text-sm leading-7 text-stone-600">{g.description}</p><p className="mt-3 text-xs text-stone-500">Giá và giờ mở cửa: chưa xác minh</p><a className="mt-4 inline-block text-xs font-semibold text-emerald-800 underline" href={g.source.url} target="_blank" rel="noreferrer">{g.source.name}</a><p className="mt-2 text-xs text-stone-500">Ngày đối chiếu nguồn: {g.checkedAt}</p></article>)}</div>}
  </main>;
}
