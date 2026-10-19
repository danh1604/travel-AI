"use client";
import { useState, type FormEvent } from "react";
import { tripError, tripsFetch, type SavedTrip } from "@/lib/trips";

function draftOf(trip: SavedTrip) {
  return { revision: trip.revision, title: trip.title, notes: trip.notes, startDate: trip.plan.constraints.startDate ?? "", days: trip.plan.days.map((d) => ({ dayNumber: d.dayNumber, note: d.note ?? "", activities: d.activities.map((a) => ({ ref: a.ref, period: a.period, note: a.note ?? "" })) })) };
}
export function SavedTripEditor({ trip, onSaved, onReload }: { trip: SavedTrip; onSaved: (trip: SavedTrip) => void; onReload: () => void }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(() => draftOf(trip));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const originals = new Map(trip.plan.days.flatMap((d) => d.activities.map((a) => [a.ref, a] as const)));
  function change(run: (next: typeof draft) => void) { setDraft((old) => { const next = structuredClone(old); run(next); return next; }); }
  function reorder(day: number, index: number, offset: number) { change((next) => { const a = next.days[day].activities; [a[index], a[index + offset]] = [a[index + offset], a[index]]; }); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await tripsFetch<{ data: SavedTrip }>(`/${trip.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, startDate: draft.startDate || null }) });
      onSaved(result.data); setEditing(false);
    } catch (err) { setError(tripError(err)); } finally { setBusy(false); }
  }
  return <section className="mb-6 rounded-2xl border border-emerald-200 bg-white p-6">
    {!editing ? <><h2 className="text-xl font-semibold">{trip.title}</h2><p className="mt-2 text-xs text-stone-500">Bản {trip.revision} · Cập nhật {new Date(trip.updatedAt).toLocaleString("vi-VN")}</p>{trip.notes && <p className="mt-4 whitespace-pre-line text-sm leading-7">{trip.notes}</p>}<button className="button-primary mt-4" onClick={() => { setDraft(draftOf(trip)); setError(""); setEditing(true); }}>Chỉnh sửa lịch trình</button></> :
    <form onSubmit={submit} className="space-y-5">
      <h2 className="text-xl font-semibold">Chỉnh sửa lịch trình</h2>
      <p className="text-sm leading-6 text-stone-600">Thay đổi chỉ áp dụng cho bản lịch của bạn. Đổi ngày đi sẽ bỏ dự báo và gợi ý tour cũ để tránh nhầm dữ liệu. Sắp xếp hoạt động trong cùng buổi, hoặc đổi buổi/ngày bằng ô chọn.</p>
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
        <label className="block text-sm font-semibold">Tên chuyến đi<input className="field mt-2" value={draft.title} maxLength={160} required onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Ngày khởi hành<input className="field mt-2" type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Ghi chú chung<textarea className="field mt-2" rows={3} maxLength={5000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
        {draft.days.map((day, di) => <section key={day.dayNumber} className="rounded-xl border border-stone-200 p-4">
          <h3 className="font-semibold">Ngày {day.dayNumber}</h3>
          <label className="mt-3 block text-sm">Ghi chú ngày<textarea className="field mt-2" rows={2} maxLength={1000} value={day.note} onChange={(e) => change((next) => { next.days[di].note = e.target.value; })} /></label>
          {!day.activities.length && <p className="mt-3 text-sm text-stone-500">Chưa có hoạt động. Bạn có thể chuyển hoạt động từ ngày khác sang.</p>}
          <ol className="mt-4 space-y-4">{day.activities.map((a, ai) => <li key={a.ref} className="rounded-xl bg-stone-50 p-4">
            <p className="text-sm font-semibold">{originals.get(a.ref)?.title}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">Buổi<select className="field mt-1" value={a.period} onChange={(e) => change((next) => {
              next.days[di].activities[ai].period = e.target.value as typeof a.period;
              const order = { morning: 0, afternoon: 1, evening: 2 };
              next.days[di].activities.sort((x, y) => order[x.period] - order[y.period]);
            })}><option value="morning">Sáng</option><option value="afternoon">Chiều</option><option value="evening">Tối</option></select></label>
            <label className="text-sm">Chuyển sang ngày<select className="field mt-1" value={di} onChange={(e) => change((next) => {
              const to = Number(e.target.value); if (to === di) return;
              const [activity] = next.days[di].activities.splice(ai, 1); next.days[to].activities.push(activity);
              const order = { morning: 0, afternoon: 1, evening: 2 }; next.days[to].activities.sort((x, y) => order[x.period] - order[y.period]);
            })}>{draft.days.map((d, index) => <option key={d.dayNumber} value={index} disabled={index !== di && d.activities.length >= 6}>Ngày {d.dayNumber}</option>)}</select></label></div>
            <label className="mt-3 block text-sm">Ghi chú hoạt động<textarea className="field mt-1" rows={2} maxLength={1000} value={a.note} onChange={(e) => change((next) => { next.days[di].activities[ai].note = e.target.value; })} /></label>
            <div className="mt-3 flex flex-wrap gap-4 text-sm"><button type="button" disabled={!ai || day.activities[ai - 1]?.period !== a.period} onClick={() => reorder(di, ai, -1)}>↑ Lên</button><button type="button" disabled={ai === day.activities.length - 1 || day.activities[ai + 1]?.period !== a.period} onClick={() => reorder(di, ai, 1)}>↓ Xuống</button><button type="button" className="text-red-800" onClick={() => change((next) => { next.days[di].activities.splice(ai, 1); })}>Bỏ khỏi lịch</button></div>
          </li>)}</ol>
        </section>)}
        <div className="flex flex-wrap gap-3"><button className="button-primary" type="submit">{busy ? "Đang lưu…" : "Lưu thay đổi"}</button><button type="button" className="button-secondary" onClick={() => setEditing(false)}>Hủy chỉnh sửa</button></div>
      </fieldset>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm"><p>{error}</p><button type="button" className="mt-3 font-semibold underline" onClick={onReload}>Bỏ bản sửa, tải lại từ server</button></div>}
    </form>}
  </section>;
}
