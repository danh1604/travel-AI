import { readFile } from "node:fs/promises";
import { getDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { projectCatalog } from "./project.js";
import { snapshotSchema, type CatalogSnapshot } from "./contracts.js";
import type { MappingPlan } from "../legacy/mapping.js";
import { fileURLToPath } from "node:url";
import { createLocalAdminCatalog } from "./local-admin.js";
import { postgresAdminCatalog } from "./postgres-admin.js";

export class CatalogUnavailable extends Error {}
let cachedSnapshot: Promise<CatalogSnapshot> | undefined;

async function readSnapshot(): Promise<CatalogSnapshot> {
  try {
    const data = JSON.parse(await readFile(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8"));
    return snapshotSchema.parse(data);
  } catch {
    cachedSnapshot = undefined;
    throw new CatalogUnavailable("Catalog snapshot is unavailable. Run npm run catalog:snapshot and restart the server.");
  }
}

export const localAdminCatalog = createLocalAdminCatalog(
  fileURLToPath(new URL("../../data/catalog.admin.json", import.meta.url)),
  () => { cachedSnapshot ??= readSnapshot(); return cachedSnapshot; },
);
export function getAdminCatalog() {
  return env.CATALOG_SOURCE === "snapshot" ? localAdminCatalog : postgresAdminCatalog();
}

export async function loadCatalog(): Promise<CatalogSnapshot> {
  if (env.CATALOG_SOURCE === "snapshot") {
    try { return await localAdminCatalog.publicCatalog(); }
    catch { throw new CatalogUnavailable("Local catalog is unavailable."); }
  }
  try {
    const db = getDatabase();
    // Read a consistent snapshot and only the tables needed for Explore.
    const [categories, tours, places, departures, days, stops, images, sections] = await db.$transaction([
      db.tourCategory.findMany(), db.tour.findMany({ where: { status: "active" } }), db.catalogPlace.findMany(),
      db.tourDeparture.findMany({ where: { status: { not: "deleted" } } }), db.tourDay.findMany(), db.tourStop.findMany(),
      db.catalogImage.findMany(), db.tourSection.findMany(),
    ], { isolationLevel: "RepeatableRead" });
    return projectCatalog({ categories, tours, places, departures, days, stops, images, sections, services: [], departureServices: [], discounts: [], issues: [] } satisfies MappingPlan);
  } catch {
    throw new CatalogUnavailable("Catalog database is unavailable.");
  }
}
