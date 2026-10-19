"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-provider";
import { Icon } from "./icon";
import { askAssistant, assistantError, type AssistantReply } from "@/lib/assistant";

type Message = { id: string; role: "user" | "assistant"; text: string; reply?: AssistantReply };
const starters = ["Tôi chưa biết đi đâu, tư vấn giúp tôi", "Tôi thích biển, nên đi đâu?", "Cách tạo và lưu lịch trình?"];
export function AssistantWidget() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return <AssistantPanel key={user?.id ?? "guest"} />;
}
function AssistantPanel() {
  const [open, setOpen] = useState(false), [input, setInput] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]), [failed, setFailed] = useState("");
  const controller = useRef<AbortController | null>(null), inputRef = useRef<HTMLTextAreaElement | null>(null), bottom = useRef<HTMLDivElement | null>(null), launcher = useRef<HTMLButtonElement | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy, open]);
  function close() { setOpen(false); launcher.current?.focus(); }
  async function send(text: string) {
    const question = text.trim(); if (busy || question.length < 2 || question.length > 1000) return;
    const active = new AbortController(); controller.current = active;
    const previous = messages.filter((m) => m.role === "user").map((m) => m.text);
    const retry = failed === question && messages.at(-1)?.role === "user" && messages.at(-1)?.text === question;
    if (!retry) setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user" as const, text: question }].slice(-20));
    setBusy(true); setError(""); setFailed(""); setInput("");
    try {
      const reply = await askAssistant(question, retry ? previous.slice(0, -1) : previous, active.signal);
      if (!active.signal.aborted) setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant" as const, text: reply.answer, reply }].slice(-20));
    } catch (err) { if (!active.signal.aborted) { setError(assistantError(err)); setFailed(question); } }
    finally { if (controller.current === active) { setBusy(false); controller.current = null; } }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(input); }
  const lastReply = messages.findLast((m) => m.reply)?.reply;
  return <>
    {open && <section id="travel-assistant" role="dialog" aria-label="Trợ lý du lịch PickYourWay" onKeyDown={(e) => { if (e.key === "Escape") close(); }} className="fade-up fixed inset-x-3 bottom-24 z-50 flex h-[min(650px,calc(100dvh-120px))] flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-[0_40px_90px_-30px_rgb(6_78_59/0.55)] sm:left-auto sm:right-6 sm:w-[400px]">
      <header className="flex shrink-0 items-center justify-between gap-3 bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 px-5 py-4 text-white"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15"><Icon name="sparkles" className="h-5 w-5" /></span><div><h2 className="font-semibold">Trợ lý du lịch</h2><p className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Tư vấn có nguồn · Hướng dẫn sử dụng</p></div></div><button type="button" className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/15" aria-label="Đóng trợ lý" onClick={close}><Icon name="close" className="h-4 w-4" /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gradient-to-b from-emerald-50/40 to-white px-4 py-4" role="log" aria-live="polite" aria-relevant="additions text">
        <p className="mr-6 rounded-2xl rounded-tl-md border border-stone-100 bg-white p-4 text-sm leading-6 text-stone-700 shadow-sm">Chào bạn, mình là trợ lý PickYourWay 😊 Mình cùng tìm nơi đi chơi, lên ý tưởng và lưu chuyến đi nhé. Bạn chưa biết bắt đầu từ đâu cũng không sao!</p>
        {!messages.length && <div className="mt-3 flex flex-col gap-2">{starters.map((q) => <button key={q} className="rounded-2xl border border-emerald-200 bg-white px-3.5 py-2.5 text-left text-xs font-medium text-emerald-900 transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50" disabled={busy} onClick={() => void send(q)}>{q}</button>)}</div>}
        {messages.map((message) => <article key={message.id} className={`mt-4 rounded-2xl p-4 text-sm ${message.role === "user" ? "ml-10 rounded-tr-md bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-md shadow-emerald-900/15" : "mr-6 rounded-tl-md border border-stone-100 bg-white text-stone-800 shadow-sm"}`}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-70">{message.role === "user" ? "Bạn" : message.reply?.mode === "ai" ? "PickYourWay AI · Có nguồn" : message.reply?.mode === "source" ? "PickYourWay · Thông tin tham khảo" : "PickYourWay · Đồng hành cùng bạn"}</p>
          <p className="whitespace-pre-line break-words leading-6">{message.text}</p>
          {message.reply?.sources.length ? <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-emerald-800">Nguồn tham khảo ({message.reply.sources.length})</summary><ul className="mt-2 space-y-2">{message.reply.sources.map((source) => <li key={source.id}><Link prefetch={false} href={source.url} target={source.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="text-xs font-medium text-emerald-800 underline">{source.title}</Link></li>)}</ul></details> : null}
          {message.reply?.planner && <Link onClick={close} href={message.reply.planner.url} className="mt-4 inline-flex rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white">Lên lịch đi {message.reply.planner.destination} →</Link>}
        </article>)}
        {busy && <div role="status" className="mr-6 mt-4 flex items-center gap-3 rounded-2xl rounded-tl-md border border-stone-100 bg-white p-3.5 text-sm text-emerald-900 shadow-sm"><span aria-hidden="true" className="flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:240ms]" /></span>Đang tra cứu dữ liệu và chuẩn bị câu trả lời…</div>}
        {error && <div role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6"><p>{error}</p><button type="button" className="mt-2 font-semibold underline" disabled={busy} onClick={() => void send(failed)}>Thử lại</button><Link href="/planner" onClick={close} className="ml-4 font-semibold underline">Mở Planner</Link></div>}
        {!busy && !error && lastReply && <div className="mt-3 flex flex-wrap gap-2">{lastReply.followups.slice(0, 3).map((q) => <button key={q} className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-left text-xs text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50" onClick={() => void send(q)}>{q}</button>)}</div>}
        <div ref={bottom} />
      </div>
      <form className="shrink-0 border-t border-stone-200 p-3" onSubmit={submit}>
        <label htmlFor="assistant-question" className="sr-only">Câu hỏi cho trợ lý</label><textarea id="assistant-question" ref={inputRef} className="field resize-none text-sm" rows={2} maxLength={1000} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ví dụ: đi 3 ngày, thích biển, nên chọn đâu?" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }} />
        <div className="mt-2 flex items-center justify-between gap-3"><button type="button" className="text-xs text-stone-500" disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(""); setFailed(""); }}>Bắt đầu lại</button>{busy ? <button type="button" className="button-secondary text-xs" onClick={() => { controller.current?.abort(); setBusy(false); }}>Dừng</button> : <button type="submit" className="button-primary text-xs disabled:opacity-50" disabled={input.trim().length < 2}>Gửi câu hỏi →</button>}</div>
        <p className="mt-2 text-[10px] leading-4 text-stone-500">Thông tin tham khảo, chưa xác nhận giá/dịch vụ. Hội thoại chỉ giữ trong lần mở website này.</p>
      </form>
    </section>}
    <button ref={launcher} type="button" aria-label={open ? "Thu gọn trợ lý du lịch" : "Mở trợ lý du lịch"} aria-expanded={open} aria-controls="travel-assistant" onClick={() => open ? close() : setOpen(true)} className="fixed bottom-5 right-4 z-50 flex min-h-14 items-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-800 px-5 py-3 font-semibold text-white shadow-[0_18px_40px_-12px_rgb(4_120_87/0.7)] ring-4 ring-white/70 transition hover:-translate-y-0.5 hover:brightness-110 sm:right-6" style={{ marginBottom: "env(safe-area-inset-bottom)" }}><Icon name="sparkles" className="h-5 w-5" /><span className="text-sm">{open ? "Thu gọn" : "Hỏi trợ lý du lịch"}</span></button>
  </>;
}
