import { randomUUID } from "node:crypto";
import { getDatabase } from "../config/database.js";
import type { Prisma } from "../generated/prisma/client.js";
import { CatalogWriteError } from "./admin-contracts.js";
import {
  activityTypeSchema,
  checkContentOwnership,
  type TourContent,
  type TourContentInput,
} from "./content-contracts.js";

async function readContent(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<TourContent> {
  const tour = await tx.tour.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      revision: true,
      images: {
        where: { isHidden: false },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { url: true },
      },
      days: {
        where: { isHidden: false },
        orderBy: [{ dayNumber: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          mealNote: true,
          stops: {
            where: { isHidden: false },
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: {
              id: true,
              type: true,
              title: true,
              content: true,
              placeLabel: true,
              place: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!tour) throw new CatalogWriteError(404, "not_found");
  return {
    ...tour,
    images: tour.images.map((image) => image.url),
    days: tour.days.map((day) => ({
      ...day,
      stops: day.stops.map(({ place, placeLabel, ...stop }) => ({
        ...stop,
        type: activityTypeSchema.parse(stop.type),
        placeName:
          placeLabel != null ? placeLabel || null : (place?.name ?? null),
      })),
    })),
  };
}
export function getPostgresContent(id: string) {
  return getDatabase().$transaction((tx) => readContent(tx, id), {
    isolationLevel: "RepeatableRead",
  });
}
export function savePostgresContent(id: string, input: TourContentInput) {
  return getDatabase().$transaction(
    async (tx) => {
      const updated = await tx.tour.updateMany({
        where: { id, revision: input.revision },
        data: { revision: { increment: 1 }, needsReview: true },
      });
      if (!updated.count)
        throw new CatalogWriteError(
          (await tx.tour.count({ where: { id } })) ? 409 : 404,
          "stale_revision",
        );
      const before = await readContent(tx, id);
      checkContentOwnership(
        input,
        new Set(before.days.map((day) => day.id!)),
        new Set(
          before.days.flatMap((day) => day.stops.map((stop) => stop.id!)),
        ),
      );

      const images = await tx.catalogImage.findMany({ where: { tourId: id } });
      const imageIds: string[] = [];
      for (const [position, url] of input.images.entries()) {
        const existing = images.find((image) => image.url === url);
        const imageId = existing?.id ?? randomUUID();
        imageIds.push(imageId);
        if (existing)
          await tx.catalogImage.update({
            where: { id: imageId },
            data: { position, isHidden: false },
          });
        else
          await tx.catalogImage.create({
            data: {
              id: imageId,
              tourId: id,
              sourceDatabase: "manual",
              sourceCollection: "tour_images",
              sourceId: imageId,
              url,
              position,
            },
          });
      }
      await tx.catalogImage.updateMany({
        where: { tourId: id, id: { notIn: imageIds } },
        data: { isHidden: true },
      });

      const dayIds: string[] = [],
        stopIds: string[] = [];
      for (const [dayIndex, day] of input.days.entries()) {
        const dayId = day.id ?? randomUUID();
        dayIds.push(dayId);
        const data = {
          dayNumber: dayIndex + 1,
          title: day.title,
          mealNote: day.mealNote,
          isHidden: false,
        };
        if (day.id) await tx.tourDay.update({ where: { id: dayId }, data });
        else
          await tx.tourDay.create({
            data: {
              ...data,
              id: dayId,
              tourId: id,
              sourceDatabase: "manual",
              sourceId: dayId,
            },
          });
        for (const [position, stop] of day.stops.entries()) {
          const stopId = stop.id ?? randomUUID();
          stopIds.push(stopId);
          const stopData = {
            dayId,
            position,
            type: stop.type,
            title: stop.title,
            content: stop.content,
            placeLabel: stop.placeName ?? "",
            isHidden: false,
          };
          if (stop.id)
            await tx.tourStop.update({ where: { id: stopId }, data: stopData });
          else
            await tx.tourStop.create({
              data: {
                ...stopData,
                id: stopId,
                sourceDatabase: "manual",
                sourceId: stopId,
              },
            });
        }
      }
      await tx.tourStop.updateMany({
        where: { day: { tourId: id }, id: { notIn: stopIds } },
        data: { isHidden: true },
      });
      await tx.tourDay.updateMany({
        where: { tourId: id, id: { notIn: dayIds } },
        data: { isHidden: true },
      });
      return readContent(tx, id);
    },
    { timeout: 30_000 },
  );
}
