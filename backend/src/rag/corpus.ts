import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { CatalogSnapshot } from "../catalog/contracts.js";
import type { TravelGuide } from "../catalog/guides.js";
import { embeddingVersion, type KnowledgeDoc } from "./retrieve.js";

export async function buildCorpus(catalog: CatalogSnapshot | null, guides: TravelGuide[]) {
  const help = z.array(z.object({ id: z.string(), title: z.string(), url: z.string(), body: z.string() })).parse(JSON.parse(await readFile(new URL("../../resources/help-knowledge.json", import.meta.url), "utf8")));
  const docs: KnowledgeDoc[] = help.map((h) => ({ ...h, kind: "help", destinations: [] }));
  for (const g of guides) docs.push({ id: `guide:${g.id}`, title: g.name, body: `${g.destination}. ${g.description} Sở thích: ${g.tags.join(", ")}. Nguồn tham khảo kiểm tra ${g.checkedAt}; chưa xác minh giá vé và giờ mở cửa.`, url: g.source.url, kind: "guide", destinations: [g.destination] });
  for (const destination of [...new Set(guides.map((g) => g.destination))]) {
    const points = guides.filter((g) => g.destination === destination);
    docs.push({ id: `destination:${destination}`, title: `Gợi ý điểm đến ${destination}`, body: `Chưa biết đi đâu: chọn điểm đến ${destination}. Các ý tưởng tham quan: ${points.map((p) => `${p.name} (${p.tags.join(", ")})`).join("; ")}. Chọn theo sở thích, số ngày và ngân sách nhóm. Chưa đủ giá dịch vụ để kết luận điểm đến rẻ nhất.`, url: "/explore/guides", kind: "destination", destinations: [destination] });
  }
  // Public catalog projection only. Never index users, bookings, legacy payloads or saved trips.
  for (const tour of (catalog?.tours ?? []).slice(0, 200)) {
    const destinations = guides.filter((g) => tour.name.toLocaleLowerCase("vi").includes(g.destination.toLocaleLowerCase("vi"))).map((g) => g.destination);
    docs.push({ id: `tour:${tour.id}`, title: tour.name.slice(0, 200), body: `Tour ${tour.name}. Nhóm ${tour.category.name}. Khởi hành từ ${tour.departureLocation}. Thời lượng ${tour.durationDays ?? "chưa rõ"} ngày. Mở chi tiết tour để kiểm tra lịch khởi hành, số chỗ và giá đã xác nhận.`, url: `/explore/tours/${tour.id}`, kind: "tour", destinations: [...new Set(destinations)] });
    for (const day of tour.days.slice(0, 4)) docs.push({ id: `tour:${tour.id}:day:${day.id}`, title: `${tour.name} — ${day.title}`.slice(0, 200), body: day.stops.map((s) => `${s.title}${s.placeName ? `: ${s.placeName}` : ""}`).join("; ").slice(0, 700), url: `/explore/tours/${tour.id}`, kind: "tour", destinations: [...new Set(destinations)] });
  }
  const bounded = [...new Map(docs.filter((d) => d.body.trim()).map((d) => [d.id, { ...d, body: d.body.slice(0, 800) }])).values()].slice(0, 1100);
  const fingerprint = createHash("sha256").update(embeddingVersion + JSON.stringify(bounded)).digest("hex");
  return { docs: bounded, fingerprint };
}
