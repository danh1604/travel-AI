"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { Icon } from "@/components/icon";
import { Itinerary, TourSuggestions } from "@/components/itinerary";
import { SavePlanButton } from "@/components/save-plan-button";
import { apiFetch } from "@/lib/api";
import { generatePlan, plannerError, type PlannerRequest, type PlannerResult } from "@/lib/planner";
import { plannerStageLabels, type PlannerStage } from "@/lib/planner-stream";
import { UpcomingTourFinder } from "./upcoming-tour-finder";

export function Planner({ initialDestination = "", initialPrompt = "" }: { initialDestination?: string; initialPrompt?: string }) {
  const { user, loading } = useAuth();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [fields, setFields] = useState({ destination: initialDestination, days: "", people: "", budgetVnd: "", startDate: "", style: "" });
  const [resultRecord, setResultRecord] = useState<{ ownerId: string; data: PlannerResult } | null>(null);
  const result = resultRecord?.ownerId === user?.id ? resultRecord?.data : null;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stage, setStage] = useState<PlannerStage | null>(null);
  const [configuration, setConfiguration] = useState<{ aiConfigured: boolean; weatherConfigured: boolean } | null>(null);
  const active = useRef<AbortController | null>(null);
  const resultPanel = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (resultRecord?.ownerId === user?.id && resultRecord) {
      resultPanel.current?.focus({ preventScroll: true });
      resultPanel.current?.scrollIntoView({ block: "start" });
    }
  }, [resultRecord, user?.id]);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<{ aiConfigured: boolean; weatherConfigured: boolean }>("planner/status", { signal: controller.signal, cache: "no-store" }).then(setConfiguration).catch(() => {});
    return () => { controller.abort(); active.current?.abort(); };
  }, []);
  function field(name: keyof typeof fields, value: string) { setFields((previous) => ({ ...previous, [name]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !user) return;
    if (!prompt.trim() && !fields.destination.trim()) { setError("Hãy mô tả chuyến đi hoặc điền điểm đến để bắt đầu."); resultPanel.current?.focus(); return; }
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(""); setNotice(""); setStage(null);
    const input: PlannerRequest = { prompt: prompt.trim() || `Lập lịch trình du lịch ${fields.destination.trim()} theo các thông tin đã điền, ưu tiên nhịp độ phù hợp.` };
    if (fields.destination.trim()) input.destination = fields.destination.trim();
    if (fields.startDate) input.startDate = fields.startDate;
    if (fields.style) input.style = fields.style as PlannerRequest["style"];
    if (fields.days) input.days = Number(fields.days);
    if (fields.people) input.people = Number(fields.people);
    if (fields.budgetVnd) input.budgetVnd = Number(fields.budgetVnd);
    try {
      const data = await generatePlan(input, controller.signal, (next) => { if (!controller.signal.aborted) setStage(next); });
      if (controller.signal.aborted) return;
      setResultRecord({ ownerId: user!.id, data });
      setFields({ destination: data.constraints.destination ?? "", days: String(data.constraints.days ?? ""), people: String(data.constraints.people ?? ""), budgetVnd: String(data.constraints.budgetVnd ?? ""), startDate: data.constraints.startDate ?? "", style: data.constraints.style });
    } catch (err) { if (!controller.signal.aborted) { setError(plannerError(err)); resultPanel.current?.focus(); } }
    finally { if (active.current === controller) { setBusy(false); active.current = null; } }
  }
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 px-6 py-10 text-white sm:px-12">
        <div aria-hidden="true" className="absolute -right-10 -top-20 h-72 w-72 rounded-full bg-emerald-300/25 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-orange-300/20 blur-3xl" />
        <div className="relative">
          <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider"><Icon name="sparkles" className="h-3.5 w-3.5" /> AI Travel Planner</span>
          <h1 className="display-type mt-4 text-4xl sm:text-5xl">Lên lịch cho chuyến đi của bạn</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75">Kể về chuyến đi bạn mong muốn. AI tìm trong lịch trình tour hiện có và sắp xếp các điểm theo ngày để bạn tham khảo.</p>
          <ol aria-label="Các bước lên kế hoạch" className="mt-7 grid gap-3 text-sm sm:grid-cols-3">{["Chia sẻ mong muốn", "Xem lịch từng ngày", "Lưu vào tài khoản"].map((label, index) => <li key={label} className="glass flex items-center gap-3 rounded-2xl px-4 py-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white font-bold text-emerald-900">{index + 1}</span>{label}</li>)}</ol>
        </div>
      </div>
      <UpcomingTourFinder />
      <div className="mt-8 grid items-start gap-7 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="card p-6 xl:sticky xl:top-24">
          {!loading && !user && <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm"><Link href="/login" className="font-semibold text-emerald-800 underline">Đăng nhập</Link> để tạo lịch trình AI.</p>}
          {configuration && !configuration.aiConfigured && <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm leading-6">Tính năng tạo lịch AI hiện chưa sẵn sàng. Bạn có thể <Link href="/explore" className="font-semibold text-emerald-800 underline">khám phá các tour</Link> trước và quay lại sau nhé.</p>}
          <form onSubmit={submit}>
            <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
              <div><p className="text-sm font-semibold">Thử một ý tưởng</p><div className="mt-2 flex flex-wrap gap-2">{[
                ["Biển & thư giãn", "Đà Nẵng", "Đi Đà Nẵng 3 ngày, 2 người, tổng ngân sách nhóm 12 triệu, thích biển và lịch thư giãn."],
                ["Thiên nhiên & cà phê", "Đà Lạt", "Đi Đà Lạt 3 ngày, 2 người, tổng ngân sách nhóm 10 triệu, thích thiên nhiên và cà phê, không muốn đi dày."],
                ["Văn hóa & ẩm thực", "Huế", "Đi Huế 2 ngày, 2 người, tổng ngân sách nhóm 8 triệu, thích di sản, văn hóa và ẩm thực."],
              ].map(([label, destination, text]) => <button key={label} type="button" className="chip font-semibold text-emerald-800" onClick={() => { setPrompt(text); setFields({ destination, days: "", people: "", budgetVnd: "", startDate: "", style: "" }); setError(""); }}>{label}</button>)}</div></div>
              <label className="block text-sm font-semibold">Bạn muốn đi đâu và trải nghiệm gì?
                <textarea className="field mt-2" rows={4} minLength={5} maxLength={2000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Đi Đà Nẵng 3 ngày, 2 người, tổng ngân sách 12 triệu, thích biển và ăn uống, lịch trình thư giãn…" />
              </label>
              <p className="text-xs leading-6 text-stone-500">Viết mô tả hoặc điền các ô bên dưới. Khi đã điền đủ thông tin, bạn có thể để trống mô tả. Giá trị trong ô được ưu tiên; chọn rõ nhịp độ giúp xử lý nhanh hơn.</p>
              <label className="block text-sm font-semibold">Điểm đến<input className="field mt-2" maxLength={100} value={fields.destination} onChange={(e) => field("destination", e.target.value)} placeholder="AI sẽ đọc từ mô tả" /></label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-semibold">Số ngày<input className="field mt-2" type="number" min={1} max={14} step={1} value={fields.days} onChange={(e) => field("days", e.target.value)} placeholder="1–14" /></label>
                <label className="block text-sm font-semibold">Số người<input className="field mt-2" type="number" min={1} max={50} step={1} value={fields.people} onChange={(e) => field("people", e.target.value)} placeholder="1–50" /></label>
              </div>
              <label className="block text-sm font-semibold">Tổng ngân sách nhóm (VNĐ)<input className="field mt-2" type="number" min={1} max={1000000000000} step={1} value={fields.budgetVnd} onChange={(e) => field("budgetVnd", e.target.value)} placeholder="Ví dụ: 12000000" /></label>
              <label className="block text-sm font-semibold">Ngày khởi hành (nếu đã biết)<input className="field mt-2" type="date" value={fields.startDate} onChange={(e) => field("startDate", e.target.value)} /></label>
              <p className="text-xs leading-6 text-stone-500">Nếu không có tour đúng ngày, hệ thống gợi ý lịch khởi hành gần nhất, có thể sớm hoặc muộn hơn. Ngày trong kế hoạch của bạn vẫn được giữ nguyên.</p>
              <label className="block text-sm font-semibold">Nhịp độ<select className="field mt-2" value={fields.style} onChange={(e) => field("style", e.target.value)}><option value="">Đọc từ mô tả</option><option value="relaxed">Thư giãn · tối đa 3 hoạt động/ngày</option><option value="balanced">Cân bằng · tối đa 4 hoạt động/ngày</option><option value="active">Nhiều trải nghiệm · tối đa 6 hoạt động/ngày</option></select></label>
              <button type="submit" disabled={loading || !user || configuration?.aiConfigured === false} className="button-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"><Icon name="sparkles" className="h-4 w-4" />{busy ? "AI đang lập lịch…" : "Tạo lịch trình"}</button>
            </fieldset>
          </form>
          {busy && <button className="button-secondary mt-3 w-full justify-center" onClick={() => { active.current?.abort(); setBusy(false); setStage(null); setNotice("Đã dừng chờ kết quả. Bạn có thể chỉnh thông tin và tạo lại; lịch cũ vẫn được giữ nếu đã có."); }}>Hủy chờ kết quả</button>}
          <p className="mt-4 text-xs leading-6 text-stone-500">Sau khi tạo, kiểm tra lịch rồi bấm “Lưu vào chuyến đi của tôi” trong khung kết quả để giữ lịch trong tài khoản.</p>
          <Link href="/explore" className="mt-4 inline-block text-sm font-semibold text-emerald-800 underline">Xem tour và điểm đến đang có</Link>
          <Link href="/explore/guides" className="mt-3 block text-sm font-semibold text-emerald-800 underline">Xem các điểm tham khảo mới từ website du lịch</Link>
        </section>
        <section ref={resultPanel} tabIndex={-1} aria-label="Kết quả lịch trình" aria-busy={busy} className="min-w-0 scroll-mt-24 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Kế hoạch của bạn</h2><Link href="/my-trips" className="text-sm font-semibold text-emerald-800 underline">Chuyến đi đã lưu →</Link></div>
          {notice && <p role="status" className="mb-4 rounded-xl border border-stone-200 bg-white p-4 text-sm leading-6">{notice}</p>}
          {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-5 text-sm leading-7 text-red-900"><p>{error}</p>{result?.status === "ready" && <p className="mt-2">Lịch đang hiển thị bên dưới là kết quả lần trước; bạn vẫn có thể lưu lịch đó.</p>}</div>}
          <SavePlanButton key={`${user?.id}:${result?.status === "ready" ? result.draftId ?? result.generatedAt : "empty"}`} draftId={result?.status === "ready" ? result.draftId : undefined} hasPlan={result?.status === "ready"} generating={busy} />
          {busy && <div className="card border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-7" role="status"><span aria-hidden="true" className="mb-4 inline-flex h-10 w-10 animate-spin items-center justify-center rounded-full border-4 border-emerald-200 border-t-emerald-600" /><h2 className="text-lg font-semibold">{stage ? plannerStageLabels[stage] : "Đang chuẩn bị yêu cầu"}</h2><p className="mt-3 text-sm leading-7">Bạn có thể hủy chờ. Kết quả trước vẫn được giữ nếu yêu cầu mới gặp lỗi.</p><ol className="mt-5 space-y-2 text-sm">{Object.entries(plannerStageLabels).map(([key, label], index) => { const current = stage ? Object.keys(plannerStageLabels).indexOf(stage) : -1; return <li key={key} className={index === current ? "font-semibold text-emerald-900" : index < current ? "text-emerald-700" : "text-stone-400"}>{index < current ? "✓" : index === current ? "●" : "○"} {label}</li>; })}</ol></div>}
          {!busy && result && result.status !== "ready" && <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-lg font-semibold">{result.status === "needs_input" ? "Thêm một chút thông tin nữa nhé" : "Chưa tìm đủ hoạt động phù hợp"}</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7">{result.questions.map((q) => <li key={q}>{q}</li>)}</ul><p className="mt-4 text-sm">Thông tin đã nhập vẫn được giữ. Bạn chỉnh trong biểu mẫu rồi bấm Tạo lịch trình nhé.</p></div>}
          {!busy && result?.status === "ready" && <Itinerary plan={result} />}
          {!busy && result?.status === "no_data" && result.packageQuotes && <TourSuggestions quotes={result.packageQuotes} />}
          {!busy && !result && !error && <div className="card border-dashed px-7 py-16 text-center"><span className="icon-bubble h-16 w-16 rounded-3xl"><Icon name="sparkles" className="h-8 w-8" /></span><h2 className="display-type mt-5 text-2xl">Một hành trình, theo cách của bạn</h2><p className="mx-auto mt-4 max-w-md text-sm leading-7 text-stone-500">Lịch trình từng ngày, liên kết tới tour nguồn và dự báo thời tiết khi có dữ liệu. Chi phí thiếu được ghi rõ.</p></div>}
        </section>
      </div>
    </main>
  );
}
