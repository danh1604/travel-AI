import { randomUUID } from "node:crypto";
import { getDatabase } from "../config/database.js";
import type { Prisma } from "../generated/prisma/client.js";
import { CatalogWriteError } from "./admin-contracts.js";
import { canArchiveDeparture, type DepartureInput, type DepartureList } from "./departure-contracts.js";

async function read(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<DepartureList> {
  const tour = await tx.tour.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      revision: true,
      departures: {
        where: { status: { not: "deleted" } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          basePriceVnd: true,
          salePriceVnd: true,
          minPeople: true,
          maxPeople: true,
          bookedPeople: true,
          status: true,
          priceConfirmed: true,
        },
      },
    },
  });
  if (!tour) throw new CatalogWriteError(404, "not_found");
  return {
    ...tour,
    departures: tour.departures.map((item) => ({
      ...item,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
      basePriceVnd: String(item.basePriceVnd),
      salePriceVnd: String(item.salePriceVnd),
      status: item.status as "open" | "closed" | "full",
    })),
  };
}
async function claim(
  tx: Prisma.TransactionClient,
  id: string,
  revision: number,
) {
  const updated = await tx.tour.updateMany({
    where: { id, revision },
    data: { revision: { increment: 1 }, needsReview: true },
  });
  if (!updated.count)
    throw new CatalogWriteError(
      (await tx.tour.count({ where: { id } })) ? 409 : 404,
      "stale_revision",
    );
}
export function getPostgresDepartures(id: string) {
  return getDatabase().$transaction((tx) => read(tx, id), {
    isolationLevel: "RepeatableRead",
  });
}
export function savePostgresDeparture(
  id: string,
  input: DepartureInput,
  departureId?: string,
) {
  return getDatabase().$transaction(async (tx) => {
    await claim(tx, id, input.revision);
    if (
      departureId &&
      !(await tx.tourDeparture.count({
        where: { id: departureId, tourId: id, status: { not: "deleted" } },
      }))
    )
      throw new CatalogWriteError(404, "departure_not_found");
    const { revision: _revision, ...fields } = input;
    const data = {
      ...fields,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      needsReview: true,
    };
    if (departureId)
      await tx.tourDeparture.update({ where: { id: departureId }, data });
    else {
      const recordId = randomUUID();
      await tx.tourDeparture.create({
        data: {
          ...data,
          id: recordId,
          tourId: id,
          sourceDatabase: "manual",
          sourceId: recordId,
        },
      });
    }
    return read(tx, id);
  });
}
export function archivePostgresDeparture(
  id: string,
  departureId: string,
  revision: number,
) {
  return getDatabase().$transaction(async (tx) => {
    await claim(tx, id, revision);
    const departure = await tx.tourDeparture.findFirst({
      where: { id: departureId, tourId: id, status: { not: "deleted" } },
    });
    if (!departure) throw new CatalogWriteError(404, "departure_not_found");
    if (!canArchiveDeparture(departure.startsAt, departure.bookedPeople))
      throw new CatalogWriteError(409, "departure_has_guests");
    await tx.tourDeparture.update({
      where: { id: departureId },
      data: { status: "deleted" },
    });
    return read(tx, id);
  });
}

export function closePostgresDeparture(
  id: string,
  departureId: string,
  revision: number,
) {
  return getDatabase().$transaction(async (tx) => {
    await claim(tx, id, revision);
    const result = await tx.tourDeparture.updateMany({
      where: { id: departureId, tourId: id, status: { not: "deleted" } },
      data: { status: "closed" },
    });
    if (!result.count) throw new CatalogWriteError(404, "departure_not_found");
    return read(tx, id);
  });
}

export function archivePastPostgresDepartures(id: string, revision: number) {
  return getDatabase().$transaction(async (tx) => {
    await claim(tx, id, revision);
    await tx.tourDeparture.updateMany({
      where: { tourId: id, status: { not: "deleted" }, startsAt: { lt: new Date() } },
      data: { status: "deleted" },
    });
    return read(tx, id);
  });
}
