import { randomUUID } from "node:crypto";
import { getDatabase } from "../config/database.js";
import { planRefresh, type RefreshInput } from "./departure-refresh.js";

/** Re-dates stale departures. Dry runs read only; applying runs in one transaction. */
export function refreshPostgresDepartures(input: RefreshInput) {
  return getDatabase().$transaction(
    async (tx) => {
      const now = Date.now();
      const tours = await tx.tour.findMany({
        where: input.tourId ? { id: input.tourId } : { status: "active" },
        select: {
          id: true,
          name: true,
          status: true,
          departures: {
            where: { status: { not: "deleted" } },
            select: {
              id: true, startsAt: true, endsAt: true, status: true, bookedPeople: true,
              basePriceVnd: true, salePriceVnd: true, minPeople: true, maxPeople: true, priceConfirmed: true,
            },
          },
        },
      });
      // Originals that already have a refresh copy (sourceDatabase "refresh", sourceId = original id).
      const copied = new Set(
        (await tx.tourDeparture.findMany({ where: { sourceDatabase: "refresh", tourId: { in: tours.map((tour) => tour.id) } }, select: { sourceId: true } })).map((item) => item.sourceId),
      );
      const result = planRefresh(
        tours.map((tour) => ({
          id: tour.id,
          name: tour.name,
          status: tour.status === "active" ? ("active" as const) : ("inactive" as const),
          departures: tour.departures.map((item) => ({
            id: item.id,
            startsAt: item.startsAt.toISOString(),
            endsAt: item.endsAt.toISOString(),
            status: item.status,
            bookedPeople: item.bookedPeople,
            cloned: copied.has(item.id),
          })),
        })),
        input,
        now,
      );
      if (input.dryRun) return result;
      for (const planned of result.tours) {
        const departures = new Map(tours.find((tour) => tour.id === planned.id)!.departures.map((item) => [item.id, item]));
        for (const change of planned.changes) {
          const fresh = { startsAt: new Date(change.to), endsAt: new Date(change.endsAt), status: "open", needsReview: true };
          if (change.action === "move") {
            await tx.tourDeparture.update({ where: { id: change.departureId }, data: fresh });
          } else {
            const source = departures.get(change.departureId)!;
            const id = randomUUID();
            await tx.tourDeparture.create({
              data: {
                ...fresh, id, tourId: planned.id, sourceDatabase: "refresh", sourceId: change.departureId,
                basePriceVnd: source.basePriceVnd, salePriceVnd: source.salePriceVnd, priceConfirmed: source.priceConfirmed,
                minPeople: source.minPeople, maxPeople: source.maxPeople, bookedPeople: 0,
              },
            });
          }
        }
        // Concurrent editors holding an older revision must reload before saving.
        await tx.tour.update({ where: { id: planned.id }, data: { revision: { increment: 1 } } });
      }
      return result;
    },
    { timeout: 60_000 },
  );
}
