import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { CatalogSnapshot } from "../catalog/contracts.js";
import type { TravelGuide } from "../catalog/guides.js";
import type { TravelRecord } from "../travel/contracts.js";
import { embeddingVersion, normalize, type KnowledgeDoc } from "./retrieve.js";

/** Active travel-catalogue rows (destinations plus their services) from the backend database. */
export type TravelKnowledge = { destination: TravelRecord; hotels: TravelRecord[]; restaurants: TravelRecord[]; attractions: TravelRecord[]; transportations: TravelRecord[] }[];

const modeLabels: Record<string, string> = { FLIGHT: "máy bay", TRAIN: "tàu hỏa", BUS: "xe khách", CAR: "ô tô", TAXI: "taxi", MOTORBIKE: "xe máy", BOAT: "tàu thuyền" };
// Free-text tour content is partner supplied and may quote unverified prices; drop those sentences.
const moneyLike = /\d{4,}|\d\s*(?:k|đ|vnd|vnđ|usd)\b|triệu|nghìn|ngàn|giá/i;
const publicText = (text: unknown, max: number) => (typeof text === "string" ? text : "").replace(/<[^>]*>/g, " ").split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter((s) => s && !moneyLike.test(s)).join(" ").slice(0, max);
const list = (items: (string | null | undefined)[] | undefined) => (items ?? []).filter(Boolean).join(", ");
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const detect = (text: string, names: string[]) => { const folded = normalize(text); return names.filter((name) => new RegExp(`(?:^|[^a-z0-9])${escapeRegex(normalize(name))}(?:[^a-z0-9]|$)`).test(folded)); };

export async function buildCorpus(catalog: CatalogSnapshot | null, guides: TravelGuide[], travel: TravelKnowledge = []) {
  const help = z.array(z.object({ id: z.string(), title: z.string(), url: z.string(), body: z.string() })).parse(JSON.parse(await readFile(new URL("../../resources/help-knowledge.json", import.meta.url), "utf8")));
  const docs: KnowledgeDoc[] = help.map((h) => ({ ...h, kind: "help", destinations: [] }));
  for (const g of guides) docs.push({ id: `guide:${g.id}`, title: g.name, body: `${g.destination}. ${g.description} Sở thích: ${g.tags.join(", ")}. Nguồn tham khảo kiểm tra ${g.checkedAt}; chưa xác minh giá vé và giờ mở cửa.`, url: g.source.url, kind: "guide", destinations: [g.destination] });
  const guideDestinations = [...new Set(guides.map((g) => g.destination))];
  for (const destination of guideDestinations) {
    const points = guides.filter((g) => g.destination === destination);
    docs.push({ id: `destination:${destination}`, title: `Gợi ý điểm đến ${destination}`, body: `Chưa biết đi đâu: chọn điểm đến ${destination}. Các ý tưởng tham quan: ${points.map((p) => `${p.name} (${p.tags.join(", ")})`).join("; ")}. Chọn theo sở thích, số ngày và ngân sách nhóm. Chưa đủ giá dịch vụ để kết luận điểm đến rẻ nhất.`, url: "/explore/guides", kind: "destination", destinations: [destination] });
  }

  // Backend travel catalogue. Prices are deliberately left out: only confirmed prices may be quoted, and the
  // service pages carry the current figures.
  for (const { destination, hotels, restaurants, attractions, transportations } of travel) {
    const name = destination.name, url = `/destinations/${destination.slug}`;
    docs.push({ id: `travel:${destination.slug}`, title: `Điểm đến ${name}`, body: `${name} (${destination.province}). ${publicText(destination.description, 400)} Đặc trưng: ${list(destination.tags)}. Dịch vụ trên hệ thống: ${hotels.length} nơi lưu trú, ${restaurants.length} quán ăn, ${attractions.length} điểm tham quan, ${transportations.length} phương tiện. Xem trang điểm đến để biết giá hiện tại.`, url, kind: "destination", destinations: [name] });
    for (const a of attractions) docs.push({ id: `travel:attraction:${a.slug}`, title: `${a.name} (${name})`, body: `Điểm tham quan ở ${name}: ${a.name}. ${publicText(a.description, 300)} Địa chỉ: ${a.address}. Thời lượng khoảng ${a.durationMinutes ?? "chưa rõ"} phút, ${a.isIndoor ? "trong nhà, hợp ngày mưa" : "ngoài trời"}. Nhóm: ${list(a.tags)}.`, url: `/explore/attractions?destination=${destination.slug}`, kind: "travel", destinations: [name] });
    for (const r of restaurants) docs.push({ id: `travel:restaurant:${r.slug}`, title: `${r.name} (${name})`, body: `Quán ăn ở ${name}: ${r.name}. ${publicText(r.description, 300)} Địa chỉ: ${r.address}. Món/nhu cầu ăn uống: ${list(r.foodOptions as string[] | undefined)}. Nhóm: ${list(r.tags)}.`, url: `/explore/restaurants?destination=${destination.slug}`, kind: "travel", destinations: [name] });
    for (const h of hotels) docs.push({ id: `travel:hotel:${h.slug}`, title: `${h.name} (${name})`, body: `Nơi lưu trú ở ${name}: ${h.name}. Địa chỉ: ${h.address}. Tối đa ${h.roomCapacity ?? "?"} khách mỗi phòng. Nhóm: ${list(h.tags)}. Giá phòng thay đổi, xem trang khách sạn để biết giá hiện tại.`, url: `/explore/hotels?destination=${destination.slug}`, kind: "travel", destinations: [name] });
    for (const t of transportations) docs.push({ id: `travel:transport:${t.slug}`, title: `${t.name} (${name})`, body: `Di chuyển đến/trong ${name}: ${t.name}. Xuất phát từ ${t.departure}. Phương tiện: ${modeLabels[String(t.mode ?? "")] ?? String(t.mode)}. Thời gian khoảng ${t.durationMinutes ?? "chưa rõ"} phút, sức chứa ${t.capacity ?? "?"}.`, url: `/explore/transportations?destination=${destination.slug}`, kind: "travel", destinations: [name] });
  }

  // Public catalog projection only. Never index users, bookings, legacy payloads or saved trips.
  const knownDestinations = [...new Set([...guideDestinations, ...travel.map((t) => t.destination.name)])];
  for (const tour of (catalog?.tours ?? []).slice(0, 400)) {
    const places = tour.days.flatMap((day) => [day.title, ...day.stops.map((s) => s.placeName ?? s.title)]);
    const destinations = detect(`${tour.name} ${places.join(" ")}`, knownDestinations);
    const overview = tour.sections.filter((s) => !moneyLike.test(s.title)).slice(0, 3).map((s) => `${s.title}: ${publicText(s.content, 160)}`).filter((s) => !s.endsWith(": ")).join(" ").slice(0, 420);
    docs.push({ id: `tour:${tour.id}`, title: tour.name.slice(0, 200), body: `Tour ${tour.name}. Nhóm ${tour.category.name}. Khởi hành từ ${tour.departureLocation}. Thời lượng ${tour.durationDays ?? tour.days.length ?? "chưa rõ"} ngày. ${places.length ? `Điểm đến trong lịch trình: ${[...new Set(tour.days.flatMap((d) => d.stops.map((s) => s.placeName).filter(Boolean)))].slice(0, 8).join(", ")}. ` : ""}${overview} Mở chi tiết tour để kiểm tra lịch khởi hành, số chỗ và giá đã xác nhận.`, url: `/explore/tours/${tour.id}`, kind: "tour", destinations });
    for (const day of tour.days.slice(0, 14)) docs.push({ id: `tour:${tour.id}:day:${day.id}`, title: `${tour.name} — ${day.title}`.slice(0, 200), body: `Ngày ${day.dayNumber}: ${day.title}. ${day.stops.map((s) => `${s.title}${s.placeName ? ` (${s.placeName})` : ""}${publicText(s.content, 160) ? `: ${publicText(s.content, 160)}` : ""}`).join("; ")}.${publicText(day.mealNote, 120) ? ` Ăn uống: ${publicText(day.mealNote, 120)}` : ""}`.slice(0, 780), url: `/explore/tours/${tour.id}`, kind: "tour", destinations });
  }
  const bounded = [...new Map(docs.filter((d) => d.body.trim()).map((d) => [d.id, { ...d, body: d.body.slice(0, 800) }])).values()].slice(0, 3000);
  const fingerprint = createHash("sha256").update(embeddingVersion + JSON.stringify(bounded)).digest("hex");
  return { docs: bounded, fingerprint };
}
