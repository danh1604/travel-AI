import { randomUUID } from "node:crypto";
import { getDatabase } from "../config/database.js";
import { getPostgresContent, savePostgresContent } from "./postgres-content.js";
import {
  getPostgresDepartures,
  savePostgresDeparture,
  archivePostgresDeparture,
  closePostgresDeparture,
  archivePastPostgresDepartures,
} from "./postgres-departures.js";
import { refreshPostgresDepartures } from "./postgres-refresh.js";
import { hasUpcomingGuests } from "./departure-contracts.js";
import {
  CatalogWriteError,
  type AdminCatalogRepository,
} from "./admin-contracts.js";

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  revision: true,
} as const;
const tourSelect = {
  ...categorySelect,
  categoryId: true,
  departureLocation: true,
  durationDays: true,
  needsReview: true,
} as const;
export function postgresAdminCatalog(): AdminCatalogRepository {
  return {
    getDepartures: getPostgresDepartures,
    saveDeparture: savePostgresDeparture,
    archiveDeparture: archivePostgresDeparture,
    closeDeparture: closePostgresDeparture,
    archivePastDepartures: archivePastPostgresDepartures,
    refreshDepartures: refreshPostgresDepartures,
    deleteTour(id, revision) {
      return getDatabase().$transaction(async (tx) => {
        const tour = await tx.tour.findUnique({
          where: { id },
          select: { revision: true, departures: { where: { status: { not: "deleted" } }, select: { startsAt: true, bookedPeople: true } } },
        });
        if (!tour) throw new CatalogWriteError(404, "not_found");
        if (tour.revision !== revision) throw new CatalogWriteError(409, "stale_revision");
        if (hasUpcomingGuests(tour.departures)) throw new CatalogWriteError(409, "tour_has_upcoming_guests");
        // Departure services cascade; days, images, sections and discounts cascade from the tour.
        await tx.tourDeparture.deleteMany({ where: { tourId: id } });
        const deleted = await tx.tour.deleteMany({ where: { id, revision } });
        if (!deleted.count) throw new CatalogWriteError(409, "stale_revision");
      });
    },
    getContent: getPostgresContent,
    saveContent: savePostgresContent,
    async list() {
      const [categories, tours, departures] = await getDatabase().$transaction(
        [
          getDatabase().tourCategory.findMany({
            select: categorySelect,
            orderBy: { name: "asc" },
          }),
          getDatabase().tour.findMany({
            select: tourSelect,
            orderBy: { name: "asc" },
          }),
          getDatabase().tourDeparture.findMany({
            where: { status: { not: "deleted" } },
            select: { tourId: true, startsAt: true, status: true, bookedPeople: true, maxPeople: true },
          }),
        ],
        { isolationLevel: "RepeatableRead" },
      );
      const now = Date.now();
      const counts = new Map<string, { upcoming: number; total: number }>();
      for (const item of departures) {
        const entry = counts.get(item.tourId) ?? { upcoming: 0, total: 0 };
        entry.total++;
        if (item.status === "open" && item.startsAt.getTime() >= now && item.bookedPeople < item.maxPeople) entry.upcoming++;
        counts.set(item.tourId, entry);
      }
      // Status constraints are enforced by the database migrations.
      return {
        categories,
        tours: tours.map((tour) => ({
          ...tour,
          upcomingDepartures: counts.get(tour.id)?.upcoming ?? 0,
          totalDepartures: counts.get(tour.id)?.total ?? 0,
        })),
      } as Awaited<
        ReturnType<AdminCatalogRepository["list"]>
      >;
    },
    async saveCategory(input, id, revision) {
      const db = getDatabase();
      if (!id) {
        const createdId = randomUUID();
        return (await db.tourCategory.create({
          data: {
            ...input,
            id: createdId,
            sourceDatabase: "manual",
            sourceId: createdId,
          },
          select: categorySelect,
        })) as Awaited<ReturnType<AdminCatalogRepository["saveCategory"]>>;
      }
      return db.$transaction(async (tx) => {
        const updated = await tx.tourCategory.updateMany({
          where: { id, revision },
          data: { ...input, revision: { increment: 1 } },
        });
        if (!updated.count)
          throw new CatalogWriteError(
            (await tx.tourCategory.count({ where: { id } })) ? 409 : 404,
            "stale_revision",
          );
        return (await tx.tourCategory.findUniqueOrThrow({
          where: { id },
          select: categorySelect,
        })) as Awaited<ReturnType<AdminCatalogRepository["saveCategory"]>>;
      });
    },
    async saveTour(input, id, revision) {
      return getDatabase().$transaction(async (tx) => {
        if (!(await tx.tourCategory.count({ where: { id: input.categoryId } })))
          throw new CatalogWriteError(400, "invalid_category");
        if (!id) {
          const createdId = randomUUID();
          return (await tx.tour.create({
            data: {
              ...input,
              id: createdId,
              sourceDatabase: "manual",
              sourceId: createdId,
              needsReview: true,
            },
            select: tourSelect,
          })) as Awaited<ReturnType<AdminCatalogRepository["saveTour"]>>;
        }
        const updated = await tx.tour.updateMany({
          where: { id, revision },
          data: { ...input, needsReview: true, revision: { increment: 1 } },
        });
        if (!updated.count)
          throw new CatalogWriteError(
            (await tx.tour.count({ where: { id } })) ? 409 : 404,
            "stale_revision",
          );
        return (await tx.tour.findUniqueOrThrow({
          where: { id },
          select: tourSelect,
        })) as Awaited<ReturnType<AdminCatalogRepository["saveTour"]>>;
      });
    },
  };
}
