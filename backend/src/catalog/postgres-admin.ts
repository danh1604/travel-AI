import { randomUUID } from "node:crypto";
import { getDatabase } from "../config/database.js";
import { getPostgresContent, savePostgresContent } from "./postgres-content.js";
import {
  getPostgresDepartures,
  savePostgresDeparture,
  archivePostgresDeparture,
  closePostgresDeparture,
} from "./postgres-departures.js";
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
    getContent: getPostgresContent,
    saveContent: savePostgresContent,
    async list() {
      const [categories, tours] = await getDatabase().$transaction(
        [
          getDatabase().tourCategory.findMany({
            select: categorySelect,
            orderBy: { name: "asc" },
          }),
          getDatabase().tour.findMany({
            select: tourSelect,
            orderBy: { name: "asc" },
          }),
        ],
        { isolationLevel: "RepeatableRead" },
      );
      // Status constraints are enforced by the database migrations.
      return { categories, tours } as Awaited<
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
