"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { catalogSlug } from "@/lib/admin";
import {
  adminTravelFetch, formatPrice, kindLabels, modeLabels, sourceLabels, travelError, travelKinds,
  type AdminTravelList, type TravelItem, type TravelKind,
} from "@/lib/travel";

type Form = Record<string, string>;
const costUnitsByKind: Partial<Record<TravelKind, [string, string][]>> = {
  attractions: [["PER_PERSON", "Mỗi người"], ["PER_GROUP", "Mỗi nhóm"]],
  transportations: [["PER_PERSON", "Mỗi người"], ["PER_PERSON_ROUND_TRIP", "Mỗi người, khứ hồi"], ["PER_VEHICLE_TRIP", "Mỗi chuyến xe"], ["PER_GROUP", "Mỗi nhóm"]],
};
const hasPlaceFields = (kind: TravelKind) => kind === "hotels" || kind === "restaurants" || kind === "attractions";
const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

function emptyForm(kind: TravelKind, destinationId: string): Form {
  return { name: "", slug: "", description: "", source: "INTERNAL", sourceUrl: "", isActive: "true", destinationId, province: "", latitude: "", longitude: "", address: "", priceVnd: "", tags: "", roomCapacity: "2", foodOptions: "", costUnit: kind === "transportations" || kind === "attractions" ? "PER_PERSON" : "", durationMinutes: "60", isIndoor: "false", departure: "", mode: "BUS", capacity: "1" };
}
function formFromItem(item: TravelItem): Form {
  return {
    name: item.name, slug: item.slug, description: item.description, source: item.source, sourceUrl: item.sourceUrl ?? "", isActive: String(item.isActive),
    destinationId: item.destinationId ?? "", province: item.province ?? "", latitude: item.latitude == null ? "" : String(item.latitude), longitude: item.longitude == null ? "" : String(item.longitude),
    address: item.address ?? "", priceVnd: item.priceVnd ?? "", tags: (item.tags ?? []).join(", "), roomCapacity: String(item.roomCapacity ?? 2), foodOptions: (item.foodOptions ?? []).join(", "),
    costUnit: item.costUnit ?? "", durationMinutes: String(item.durationMinutes ?? 60), isIndoor: String(item.isIndoor ?? false), departure: item.departure ?? "", mode: item.mode ?? "BUS", capacity: String(item.capacity ?? 1),
  };
}
function toPayload(kind: TravelKind, f: Form) {
  const base = { name: f.name, slug: f.slug, description: f.description, source: f.source, sourceUrl: f.sourceUrl.trim() || null, isActive: f.isActive === "true" };
  const coordinate = (value: string) => (value.trim() === "" ? null : Number(value));
  const place = { destinationId: f.destinationId, address: f.address, latitude: coordinate(f.latitude), longitude: coordinate(f.longitude), priceVnd: f.priceVnd.trim(), tags: list(f.tags) };
  switch (kind) {
    case "destinations": return { ...base, province: f.province, latitude: Number(f.latitude), longitude: Number(f.longitude), tags: list(f.tags) };
    case "hotels": return { ...base, ...place, roomCapacity: Number(f.roomCapacity) };
    case "restaurants": return { ...base, ...place, foodOptions: list(f.foodOptions) };
    case "attractions": return { ...base, ...place, costUnit: f.costUnit, durationMinutes: Number(f.durationMinutes), isIndoor: f.isIndoor === "true" };
    case "transportations": return { ...base, destinationId: f.destinationId, departure: f.departure, mode: f.mode, priceVnd: f.priceVnd.trim(), costUnit: f.costUnit, capacity: Number(f.capacity), durationMinutes: Number(f.durationMinutes) };
  }
}

function Editor({ kind, item, destinations, busy, error, onSave, onCancel }: { kind: TravelKind; item: TravelItem | null; destinations: AdminTravelList["destinations"]; busy: boolean; error: string; onSave: (payload: object) => void; onCancel: () => void }) {
  const [form, setForm] = useState<Form>(() => (item ? formFromItem(item) : emptyForm(kind, destinations[0]?.id ?? ""))), [slugTouched, setSlugTouched] = useState(Boolean(item));
  const set = (name: string, value: string) => setForm((previous) => ({ ...previous, [name]: value, ...(name === "name" && !slugTouched ? { slug: catalogSlug(value) } : {}) }));
  const label = kindLabels[kind];
  function submit(event: FormEvent) { event.preventDefault(); onSave(toPayload(kind, form)); }
  const input = (name: string, title: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm font-medium">{title}<input className="field mt-2" value={form[name]} onChange={(event) => set(name, event.target.value)} {...props} /></label>
  );
  return (
    <form onSubmit={submit} className="admin-card min-w-0 p-5 sm:p-7 xl:sticky xl:top-24" aria-label={item ? `Sửa ${label.singular}` : `Tạo ${label.singular}`}>
      <h2 className="text-xl font-semibold">{item ? `Sửa ${label.singular}` : `Tạo ${label.singular}`}</h2>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <fieldset disabled={busy} className="mt-5 space-y-4 disabled:opacity-60">
        {input("name", "Tên", { required: true, minLength: 2, maxLength: 200 })}
        <label className="block text-sm font-medium">Slug (đường dẫn)<input className="field mt-2" value={form.slug} required maxLength={200} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(event) => { setSlugTouched(true); set("slug", event.target.value); }} /></label>
        {kind !== "destinations" && (
          <label className="block text-sm font-medium">Điểm đến
            <select className="field mt-2" value={form.destinationId} required onChange={(event) => set("destinationId", event.target.value)}>
              <option value="" disabled>Chọn điểm đến</option>
              {destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}{destination.isActive ? "" : " (ẩn)"}</option>)}
            </select></label>
        )}
        {kind === "destinations" && <>
          {input("province", "Tỉnh/thành", { required: true, minLength: 2, maxLength: 120 })}
          <div className="grid grid-cols-2 gap-3">{input("latitude", "Vĩ độ", { required: true, type: "number", step: "any", min: -90, max: 90 })}{input("longitude", "Kinh độ", { required: true, type: "number", step: "any", min: -180, max: 180 })}</div>
        </>}
        {hasPlaceFields(kind) && <>
          {input("address", "Địa chỉ", { required: true, maxLength: 300 })}
          <div className="grid grid-cols-2 gap-3">{input("latitude", "Vĩ độ (tuỳ chọn)", { type: "number", step: "any", min: -90, max: 90 })}{input("longitude", "Kinh độ (tuỳ chọn)", { type: "number", step: "any", min: -180, max: 180 })}</div>
        </>}
        {kind === "transportations" && <>
          {input("departure", "Điểm khởi hành", { required: true, minLength: 2, maxLength: 120 })}
          <label className="block text-sm font-medium">Loại phương tiện<select className="field mt-2" value={form.mode} onChange={(event) => set("mode", event.target.value)}>{Object.entries(modeLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">{input("capacity", "Sức chứa (người)", { required: true, type: "number", min: 1, max: 500 })}{input("durationMinutes", "Thời gian (phút)", { required: true, type: "number", min: 1, max: 10080 })}</div>
        </>}
        {kind !== "destinations" && <>
          {input("priceVnd", kind === "hotels" ? "Giá mỗi phòng/đêm (₫)" : kind === "restaurants" ? "Giá mỗi người/bữa (₫)" : "Giá (₫, số nguyên)", { required: true, inputMode: "numeric", pattern: "\\d{1,12}", placeholder: "Ví dụ: 750000" })}
          {costUnitsByKind[kind] && <label className="block text-sm font-medium">Đơn vị giá<select className="field mt-2" value={form.costUnit} onChange={(event) => set("costUnit", event.target.value)}>{costUnitsByKind[kind]!.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>}
        </>}
        {kind === "hotels" && input("roomCapacity", "Số khách tối đa/phòng", { required: true, type: "number", min: 1, max: 20 })}
        {kind === "restaurants" && input("foodOptions", "Món/chế độ ăn (cách nhau bằng dấu phẩy)", { placeholder: "chay, hải sản, thịt" })}
        {kind === "attractions" && <>
          {input("durationMinutes", "Thời lượng (phút)", { required: true, type: "number", min: 1, max: 10080 })}
          <label className="block text-sm font-medium">Loại hình<select className="field mt-2" value={form.isIndoor} onChange={(event) => set("isIndoor", event.target.value)}><option value="false">Ngoài trời</option><option value="true">Trong nhà</option></select></label>
        </>}
        {kind !== "transportations" && input("tags", "Thẻ (cách nhau bằng dấu phẩy)", { placeholder: "gần biển, yên tĩnh" })}
        <label className="block text-sm font-medium">Mô tả<textarea className="field mt-2" rows={3} maxLength={4000} value={form.description} onChange={(event) => set("description", event.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">Nguồn dữ liệu<select className="field mt-2" value={form.source} onChange={(event) => set("source", event.target.value)}>{Object.entries(sourceLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          <label className="block text-sm font-medium">Trạng thái<select className="field mt-2" value={form.isActive} onChange={(event) => set("isActive", event.target.value)}><option value="true">Hiển thị</option><option value="false">Ẩn</option></select></label>
        </div>
        {input("sourceUrl", "Liên kết nguồn (HTTPS, tuỳ chọn)", { type: "url", maxLength: 500, placeholder: "https://…" })}
        <div className="flex gap-3 pt-2">
          <button type="submit" className="button-primary flex-1">{busy ? "Đang lưu…" : "Lưu"}</button>
          <button type="button" className="button-secondary" onClick={onCancel}>Hủy</button>
        </div>
      </fieldset>
    </form>
  );
}

export function AdminTravel({ kind }: { kind: TravelKind }) {
  const label = kindLabels[kind];
  const [q, setQ] = useState(""), [status, setStatus] = useState("all"), [destinationId, setDestinationId] = useState(""), [page, setPage] = useState(1), [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data?: AdminTravelList; error?: string } | null>(null);
  const [editor, setEditor] = useState<{ item: TravelItem | null } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const key = `${kind}|${q}|${status}|${destinationId}|${page}|${attempt}`, view = state?.key === key ? state : null;
  useEffect(() => {
    const controller = new AbortController(), query = new URLSearchParams({ status, page: String(page) });
    if (q.trim()) query.set("q", q.trim());
    if (destinationId) query.set("destinationId", destinationId);
    adminTravelFetch<AdminTravelList>(`${kind}?${query}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch((reason) => { if (!controller.signal.aborted) setState({ key, error: travelError(reason) }); });
    return () => controller.abort();
  }, [kind, q, status, destinationId, page, key]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  async function save(payload: object) {
    setBusy(true); setError("");
    const item = editor?.item;
    try {
      await adminTravelFetch(item ? `${kind}/${item.id}` : kind, { method: item ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item ? { ...payload, revision: item.revision } : payload) });
      setNotice(item ? "Đã cập nhật." : "Đã tạo mới."); setEditor(null); reload();
    } catch (reason) { setError(travelError(reason)); } finally { setBusy(false); }
  }
  const data = view?.data;
  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <p className="eyebrow">Quản trị dữ liệu du lịch</p>
      <h1 className="display-type mt-3">{label.plural}</h1>
      <nav aria-label="Loại dữ liệu" className="my-6 flex flex-wrap gap-3 text-sm">
        {travelKinds.map((item) => <Link key={item} href={`/admin/travel/${item}`} aria-current={item === kind ? "page" : undefined} className="admin-pill">{kindLabels[item].plural}</Link>)}
      </nav>
      {notice && <p role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
      {view?.error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{view.error}</div>}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button type="button" className="admin-action py-2.5" onClick={() => { setNotice(""); setEditor(null); reload(); }}>Tải lại</button>
        {data && <button type="button" disabled={kind !== "destinations" && !data.destinations.length} className="button-primary min-h-10 px-4 py-2" onClick={() => { setEditor({ item: null }); setError(""); setNotice(""); }}>+ Tạo {label.singular}</button>}
        {data && kind !== "destinations" && !data.destinations.length && <span className="text-sm text-stone-500">Hãy tạo điểm đến trước.</span>}
      </div>
      {!view ? <p role="status" className="text-sm text-stone-500">Đang kiểm tra quyền và tải dữ liệu…</p> : data && (
        <div className={`grid items-start gap-6 ${editor ? "xl:grid-cols-[minmax(0,1fr)_400px]" : ""}`}>
          <section className="admin-card min-w-0 p-5">
            <div className="mb-5 flex flex-wrap gap-3">
              <label className="min-w-0 flex-1 text-xs text-stone-600">Tìm kiếm<input className="field mt-1" type="search" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} /></label>
              {kind !== "destinations" && <label className="text-xs text-stone-600">Điểm đến<select className="field mt-1" value={destinationId} onChange={(event) => { setDestinationId(event.target.value); setPage(1); }}><option value="">Tất cả</option>{data.destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></label>}
              <label className="text-xs text-stone-600">Trạng thái<select className="field mt-1" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">Tất cả</option><option value="active">Hiển thị</option><option value="inactive">Ẩn</option></select></label>
            </div>
            <p className="mb-3 text-xs text-stone-500">{data.pagination.total} bản ghi · 20 bản ghi mỗi trang</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{label.plural}</caption>
                <thead><tr><th scope="col" className="pr-4">{label.plural}</th>{kind !== "destinations" && <th scope="col" className="pr-4">Giá</th>}<th scope="col" className="pr-4">Trạng thái</th><th scope="col" className="text-right">Thao tác</th></tr></thead>
                <tbody>
                  {data.data.map((item) => (
                    <tr key={item.id} className="border-b border-stone-100 last:border-0">
                      <td className="py-4 pr-4"><p className="font-semibold">{item.name}</p><p className="mt-1 break-all text-xs text-stone-500">{item.slug}</p><p className="mt-1 text-xs text-stone-500">{item.destinationName ?? item.province}{item.source === "DEMO" ? " · Dữ liệu demo" : ""}</p></td>
                      {kind !== "destinations" && <td className="whitespace-nowrap py-4 pr-4 text-xs font-semibold">{formatPrice(item)}</td>}
                      <td className="py-4 pr-4"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${item.isActive ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>{item.isActive ? "Hiển thị" : "Ẩn"}</span></td>
                      <td className="py-4 text-right"><button type="button" className="admin-action" disabled={busy} aria-label={`Sửa ${item.name}`} onClick={() => { setEditor({ item }); setError(""); setNotice(""); }}>Sửa</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.data.length && <p className="py-8 text-center text-sm text-stone-500">Chưa có bản ghi phù hợp.</p>}
            </div>
            {data.pagination.totalPages > 1 && (
              <nav aria-label="Phân trang" className="mt-5 flex items-center justify-between gap-3 text-xs">
                <button type="button" className="admin-action" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</button>
                <span>Trang {data.pagination.page}/{data.pagination.totalPages}</span>
                <button type="button" className="admin-action" disabled={page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Sau</button>
              </nav>
            )}
          </section>
          {editor && <Editor key={editor.item ? `${editor.item.id}:${editor.item.revision}` : "new"} kind={kind} item={editor.item} destinations={data.destinations} busy={busy} error={error} onSave={(payload) => void save(payload)} onCancel={() => setEditor(null)} />}
        </div>
      )}
    </main>
  );
}
