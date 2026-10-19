import { readFile } from "node:fs/promises";
import { z } from "zod";
const source = z.object({ id: z.string(), name: z.string().max(200), url: z.string().url().refine((v) => { const u = new URL(v); return u.protocol === "https:" && ["www.traveloka.com", "vietnam.travel"].includes(u.hostname) && !u.search && !u.username && !u.password; }) });
const guideFile = z.object({ version: z.literal(1), checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), sources: z.array(source), places: z.array(z.object({ id: z.string(), destination: z.string(), name: z.string().max(200), description: z.string().max(500), tags: z.array(z.string()), sourceId: z.string() })) });
const fold = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
export async function loadGuides(destination?: string) {
  const data = guideFile.parse(JSON.parse(await readFile(new URL("../../resources/travel-guides.json", import.meta.url), "utf8")));
  const sources = new Map(data.sources.map((s) => [s.id, s]));
  if (new Set(data.places.map((p) => p.id)).size !== data.places.length) throw new Error("Duplicate guide ID");
  return data.places.filter((p) => !destination || fold(p.destination) === fold(destination.replace(/^(thành phố|tỉnh|tp\.?)\s+/i, ""))).map((p) => {
    const source = sources.get(p.sourceId); if (!source) throw new Error("Missing guide source");
    return { ...p, source, checkedAt: data.checkedAt, needsReview: true as const, priceVnd: null, openingHours: null };
  });
}
export type TravelGuide = Awaited<ReturnType<typeof loadGuides>>[number];
