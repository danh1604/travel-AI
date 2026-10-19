import { Router } from "express";
import { z } from "zod";
import { catalogMetadata, catalogQuerySchema, type CatalogSnapshot } from "./contracts.js";
import { CatalogUnavailable, loadCatalog } from "./repository.js";
import { env } from "../config/env.js";
import { departureSummary } from "./departure-contracts.js";
import { loadGuides } from "./guides.js";
import { dateOnly } from "../planner/contracts.js";
import { packageQuotes } from "../planner/service.js";

const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();

export function createCatalogRouter(loader: () => Promise<CatalogSnapshot> = loadCatalog, clock: () => number = Date.now) {
  const router = Router();
  router.get("/guides", async (request, response) => {
    const query = z.object({ destination: z.string().trim().min(1).max(100).optional() }).strict().safeParse(request.query);
    if (!query.success) { response.status(400).json({ error: "Invalid guide query" }); return; }
    response.set("Cache-Control", "no-store").json({ data: await loadGuides(query.data.destination) });
  });
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  function meta(catalog: CatalogSnapshot) { return catalogMetadata(env.CATALOG_SOURCE, env.CATALOG_SOURCE === "snapshot" ? catalog.generatedAt : null); }
  router.get("/upcoming-departures", async (request, response) => {
    const query = z.object({ destination: z.string().trim().max(100).default(""), people: z.coerce.number().int().min(1).max(50).optional(), days: z.coerce.number().int().min(1).max(14).optional(), startDate: dateOnly.optional() }).strict().safeParse(request.query);
    if (!query.success) { response.status(400).json({ error: "Invalid departure search" }); return; }
    const catalog = await loader(), now = clock();
    const { destination, people, days, startDate } = query.data;
    const terms = fold(destination).replace(/\b(thanh pho|tinh|tp)\b/g, "").match(/[a-z0-9]+/g) ?? [];
    const tours = catalog.tours.filter((tour) => {
      const words = new Set(fold([tour.name, ...tour.days.flatMap((day) => day.stops.flatMap((stop) => [stop.title, stop.placeName ?? ""]))].join(" ")).match(/[a-z0-9]+/g) ?? []);
      return !destination || (terms.length > 0 && terms.every((term) => words.has(term)));
    });
    const data = packageQuotes(tours, { destination: destination || null, people: people ?? 1, days: days ?? 1, startDate: startDate ?? null, budgetVnd: null, style: "balanced" }, now)
      .map((quote) => ({ ...quote, totalVnd: people ? quote.totalVnd : null }));
    response.json({ data, checkedAt: new Date(now).toISOString(), meta: meta(catalog) });
  });
  router.get("/categories", async (_request, response) => {
    const catalog = await loader();
    const activeIds = new Set(catalog.tours.map((tour) => tour.category.id));
    response.json({ data: catalog.categories.filter((category) => activeIds.has(category.id)).sort((a, b) => a.name.localeCompare(b.name, "vi")), meta: meta(catalog) });
  });
  router.get("/tours", async (request, response) => {
    const query = catalogQuerySchema.safeParse(request.query);
    if (!query.success) { response.status(400).json({ error: "Invalid search parameters" }); return; }
    const { q, category, page, limit } = query.data;
    const catalog = await loader();
    const matching = catalog.tours.filter((tour) => (!category || tour.category.id === category) && (!q || fold(`${tour.name} ${tour.departureLocation}`).includes(fold(q))))
      .sort((a, b) => a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id));
    const now = Date.now();
    const data = matching.slice((page - 1) * limit, page * limit).map(({ days: _days, sections: _sections, images: _images, departures, ...summary }) => {
      return { ...summary, ...departureSummary(departures, now) };
    });
    response.json({ data, pagination: { page, limit, total: matching.length, totalPages: Math.ceil(matching.length / limit) }, meta: meta(catalog) });
  });
  router.get("/tours/:id", async (request, response) => {
    if (!z.string().uuid().safeParse(request.params.id).success) { response.status(400).json({ error: "Invalid tour ID" }); return; }
    const catalog = await loader();
    const tour = catalog.tours.find((item) => item.id === request.params.id);
    if (!tour) { response.status(404).json({ error: "Tour not found" }); return; }
    response.json({ data: { ...tour, ...departureSummary(tour.departures) }, meta: meta(catalog) });
  });
  router.use((error: unknown, _request: import("express").Request, response: import("express").Response, next: import("express").NextFunction) => {
    if (error instanceof CatalogUnavailable) { response.status(503).json({ error: "Catalog unavailable" }); return; }
    next(error);
  });
  return router;
}
