import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { canArchiveDeparture, departureSummary, hasUpcomingGuests, type DepartureList } from "./departure-contracts.js";
import { planRefresh } from "./departure-refresh.js";
import {
  activityTypeSchema,
  checkContentOwnership,
  type TourContent,
} from "./content-contracts.js";
import {
  snapshotSchema,
  tourDetailSchema,
  type CatalogSnapshot,
} from "./contracts.js";
import {
  categoryInput,
  CatalogWriteError,
  type AdminCatalogRepository,
} from "./admin-contracts.js";

const stateSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  categories: z.array(
    categoryInput.extend({
      id: z.string().uuid(),
      revision: z.number().int().positive(),
    }),
  ),
  tours: z.array(
    tourDetailSchema.extend({
      status: z.enum(["active", "inactive"]),
      categoryId: z.string().uuid(),
      revision: z.number().int().positive(),
      departureManagement: z
        .array(
          z.object({
            id: z.string().uuid(),
            basePriceVnd: z.string().nullable(),
            minPeople: z.number().int().nullable(),
            maxPeople: z.number().int().nullable(),
            bookedPeople: z.number().int().nullable(),
            clonedFrom: z.string().uuid().nullable().default(null),
          }),
        )
        .default([]),
    }),
  ),
});
type State = z.infer<typeof stateSchema>;

// A separate development copy preserves the original snapshot and all tour detail fields.
// The exclusive file lock protects mutations across processes; rename commits a complete file.
export function createLocalAdminCatalog(
  path: string,
  seed: () => Promise<CatalogSnapshot>,
) {
  async function read(): Promise<State> {
    try {
      return stateSchema.parse(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
      const snapshot = await seed();
      return stateSchema.parse({
        ...snapshot,
        categories: snapshot.categories.map((item) => ({
          ...item,
          status: "active",
          revision: 1,
        })),
        tours: snapshot.tours.map((item) => ({
          ...item,
          categoryId: item.category.id,
          status: "active",
          revision: 1,
        })),
      });
    }
  }
  async function write<T>(change: (state: State) => T): Promise<T> {
    await mkdir(dirname(path), { recursive: true });
    const lock = await open(`${path}.lock`, "wx", 0o600).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") throw new CatalogWriteError(409, "busy");
        throw error;
      },
    );
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const state = await read();
      const result = change(state);
      state.generatedAt = new Date().toISOString();
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(stateSchema.parse(state)));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, path);
      return result;
    } finally {
      try {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      } finally {
        try {
          await lock.close();
        } finally {
          await unlink(`${path}.lock`);
        }
      }
    }
  }
  const repository: AdminCatalogRepository = {
    closeDeparture(id, departureId, revision) {
      return write((state) => {
        const tour = state.tours.find((item) => item.id === id);
        if (!tour) throw new CatalogWriteError(404, "not_found");
        if (tour.revision !== revision)
          throw new CatalogWriteError(409, "stale_revision");
        const departure = tour.departures.find(
          (item) => item.id === departureId,
        );
        if (!departure) throw new CatalogWriteError(404, "departure_not_found");
        departure.status = "closed";
        tour.revision++;
        tour.needsReview = true;
        return departureList(tour);
      });
    },
    async getDepartures(id) {
      const tour = (await read()).tours.find((item) => item.id === id);
      if (!tour) throw new CatalogWriteError(404, "not_found");
      return departureList(tour);
    },
    saveDeparture(id, input, departureId) {
      return write((state) => {
        const tour = state.tours.find((item) => item.id === id);
        if (!tour) throw new CatalogWriteError(404, "not_found");
        if (tour.revision !== input.revision)
          throw new CatalogWriteError(409, "stale_revision");
        const existing = departureId
          ? tour.departures.find((item) => item.id === departureId)
          : undefined;
        if (departureId && !existing)
          throw new CatalogWriteError(404, "departure_not_found");
        const recordId = departureId ?? randomUUID();
        const saved = {
          id: recordId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          sourcePriceVnd: input.salePriceVnd,
          status: input.status,
          needsReview: true,
          priceConfirmed: input.priceConfirmed,
          availableSeats: input.maxPeople - input.bookedPeople,
        };
        if (existing) Object.assign(existing, saved);
        else tour.departures.push(saved);
        const metadata = {
          id: recordId,
          basePriceVnd: input.basePriceVnd,
          minPeople: input.minPeople,
          maxPeople: input.maxPeople,
          bookedPeople: input.bookedPeople,
          clonedFrom: tour.departureManagement.find((item) => item.id === recordId)?.clonedFrom ?? null,
        };
        tour.departureManagement = [
          ...tour.departureManagement.filter((item) => item.id !== recordId),
          metadata,
        ];
        tour.revision++;
        tour.needsReview = true;
        return departureList(tour);
      });
    },
    archivePastDepartures(id, revision) {
      return write((state) => {
        const tour = state.tours.find((item) => item.id === id);
        if (!tour) throw new CatalogWriteError(404, "not_found");
        if (tour.revision !== revision) throw new CatalogWriteError(409, "stale_revision");
        const now = Date.now();
        const past = new Set(tour.departures.filter((item) => Date.parse(item.startsAt) < now).map((item) => item.id));
        tour.departures = tour.departures.filter((item) => !past.has(item.id));
        tour.departureManagement = tour.departureManagement.filter((item) => !past.has(item.id));
        tour.revision++;
        return departureList(tour);
      });
    },
    archiveDeparture(id, departureId, revision) {
      return write((state) => {
        const tour = state.tours.find((item) => item.id === id);
        if (!tour) throw new CatalogWriteError(404, "not_found");
        if (tour.revision !== revision)
          throw new CatalogWriteError(409, "stale_revision");
        if (!tour.departures.some((item) => item.id === departureId))
          throw new CatalogWriteError(404, "departure_not_found");
        const metadata = tour.departureManagement.find(
          (item) => item.id === departureId,
        );
        const target = tour.departures.find((item) => item.id === departureId)!;
        if (!canArchiveDeparture(target.startsAt, metadata?.bookedPeople ?? null))
          throw new CatalogWriteError(409, "departure_has_guests");
        tour.departures = tour.departures.filter(
          (item) => item.id !== departureId,
        );
        tour.departureManagement = tour.departureManagement.filter(
          (item) => item.id !== departureId,
        );
        tour.revision++;
        tour.needsReview = true;
        return departureList(tour);
      });
    },
    async getContent(id) {
      const tour = (await read()).tours.find((item) => item.id === id);
      if (!tour) throw new CatalogWriteError(404, "not_found");
      return content(tour);
    },
    saveContent(id, input) {
      return write((state) => {
        const tour = state.tours.find((item) => item.id === id);
        if (!tour) throw new CatalogWriteError(404, "not_found");
        if (tour.revision !== input.revision)
          throw new CatalogWriteError(409, "stale_revision");
        checkContentOwnership(
          input,
          new Set(tour.days.map((day) => day.id)),
          new Set(tour.days.flatMap((day) => day.stops.map((stop) => stop.id))),
        );
        tour.images = [...input.images];
        tour.coverImage = input.images[0] ?? null;
        tour.days = input.days.map((day, dayIndex) => ({
          ...day,
          id: day.id ?? randomUUID(),
          dayNumber: dayIndex + 1,
          stops: day.stops.map((stop, index) => ({
            ...stop,
            id: stop.id ?? randomUUID(),
            position: index,
          })),
        }));
        tour.revision++;
        tour.needsReview = true;
        return content(tour);
      });
    },
    deleteTour(id, revision) {
      return write((state) => {
        const index = state.tours.findIndex((item) => item.id === id);
        if (index < 0) throw new CatalogWriteError(404, "not_found");
        const tour = state.tours[index];
        if (tour.revision !== revision) throw new CatalogWriteError(409, "stale_revision");
        if (
          hasUpcomingGuests(
            tour.departures.map((item) => ({
              startsAt: item.startsAt,
              bookedPeople: tour.departureManagement.find((entry) => entry.id === item.id)?.bookedPeople ?? null,
            })),
          )
        )
          throw new CatalogWriteError(409, "tour_has_upcoming_guests");
        state.tours.splice(index, 1);
      });
    },
    refreshDepartures(input) {
      const now = Date.now();
      const plan = (state: State) =>
        planRefresh(
          state.tours.map((tour) => ({
            id: tour.id,
            name: tour.name,
            status: tour.status,
            departures: tour.departures.map((item) => ({
              id: item.id,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              status: item.status,
              bookedPeople:
                tour.departureManagement.find((entry) => entry.id === item.id)?.bookedPeople ?? null,
              cloned: tour.departureManagement.some((entry) => entry.clonedFrom === item.id),
            })),
          })),
          input,
          now,
        );
      if (input.dryRun) return read().then(plan);
      return write((state) => {
        const result = plan(state);
        for (const planned of result.tours) {
          const tour = state.tours.find((item) => item.id === planned.id)!;
          for (const change of planned.changes) {
            const source = tour.departures.find((item) => item.id === change.departureId)!;
            const metadata = tour.departureManagement.find((entry) => entry.id === source.id);
            const maxPeople = metadata?.maxPeople ?? null;
            const fresh = {
              startsAt: change.to,
              endsAt: change.endsAt,
              status: "open" as const,
              needsReview: true,
              availableSeats: maxPeople ?? (change.action === "move" ? source.availableSeats : null),
            };
            if (change.action === "move") {
              Object.assign(source, fresh);
              if (metadata && maxPeople !== null) metadata.bookedPeople = 0;
            } else {
              const id = randomUUID();
              tour.departures.push({ ...source, ...fresh, id });
              tour.departureManagement.push({
                id,
                basePriceVnd: metadata?.basePriceVnd ?? null,
                minPeople: metadata?.minPeople ?? null,
                maxPeople,
                bookedPeople: maxPeople === null ? null : 0,
                clonedFrom: source.id,
              });
            }
          }
          tour.revision++;
        }
        return result;
      });
    },
    async list() {
      const state = await read();
      const now = Date.now();
      return {
        categories: state.categories,
        tours: state.tours.map((item) => ({
          upcomingDepartures: item.departures.filter(
            (entry) =>
              entry.status === "open" &&
              Date.parse(entry.startsAt) >= now &&
              entry.availableSeats !== 0,
          ).length,
          totalDepartures: item.departures.length,
          id: item.id,
          name: item.name,
          slug: item.slug,
          status: item.status,
          categoryId: item.categoryId,
          departureLocation: item.departureLocation,
          durationDays: item.durationDays,
          revision: item.revision,
          needsReview: item.needsReview,
        })),
      };
    },
    saveCategory(input, id, revision) {
      return write((state) => {
        const existing = id
          ? state.categories.find((item) => item.id === id)
          : undefined;
        if (id && !existing) throw new CatalogWriteError(404, "not_found");
        if (existing && existing.revision !== revision)
          throw new CatalogWriteError(409, "stale_revision");
        const saved = {
          ...input,
          id: id ?? randomUUID(),
          revision: (existing?.revision ?? 0) + 1,
        };
        if (existing) Object.assign(existing, saved);
        else state.categories.push(saved);
        return saved;
      });
    },
    saveTour(input, id, revision) {
      return write((state) => {
        const existing = id
          ? state.tours.find((item) => item.id === id)
          : undefined;
        if (id && !existing) throw new CatalogWriteError(404, "not_found");
        if (existing && existing.revision !== revision)
          throw new CatalogWriteError(409, "stale_revision");
        const category = state.categories.find(
          (item) => item.id === input.categoryId,
        );
        if (!category) throw new CatalogWriteError(400, "invalid_category");
        const saved = {
          ...input,
          id: id ?? randomUUID(),
          revision: (existing?.revision ?? 0) + 1,
          needsReview: true,
        };
        if (existing) Object.assign(existing, saved);
        else
          state.tours.push({
            ...saved,
            category,
            images: [],
            coverImage: null,
            sourcePriceVnd: null,
            priceVnd: null,
            upcomingDepartures: 0,
            days: [],
            departures: [],
            departureManagement: [],
            sections: [],
          });
        return saved;
      });
    },
  };
  return {
    ...repository,
    async publicCatalog(): Promise<CatalogSnapshot> {
      const state = await read();
      const categories = state.categories.filter(
        (item) => item.status === "active",
      );
      const byId = new Map(categories.map((item) => [item.id, item]));
      return snapshotSchema.parse({
        ...state,
        categories,
        tours: state.tours
          .filter(
            (item) => item.status === "active" && byId.has(item.categoryId),
          )
          .map((item) => ({
            ...item,
            departures: [...item.departures].sort(
              (a, b) =>
                Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
                a.id.localeCompare(b.id),
            ),
            ...departureSummary(item.departures),
            category: byId.get(item.categoryId),
          })),
      });
    },
  };
}

function departureList(tour: State["tours"][number]): DepartureList {
  return {
    id: tour.id,
    name: tour.name,
    revision: tour.revision,
    departures: tour.departures
      .map((item) => {
        const metadata = tour.departureManagement.find(
          (entry) => entry.id === item.id,
        );
        return {
          id: item.id,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          salePriceVnd: item.sourcePriceVnd,
          priceConfirmed: item.priceConfirmed,
          status: item.status,
          basePriceVnd: metadata?.basePriceVnd ?? null,
          minPeople: metadata?.minPeople ?? null,
          maxPeople: metadata?.maxPeople ?? null,
          bookedPeople: metadata?.bookedPeople ?? null,
        };
      })
      .sort(
        (a, b) =>
          Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
          a.id.localeCompare(b.id),
      ),
  };
}

function content(tour: State["tours"][number]): TourContent {
  return {
    id: tour.id,
    name: tour.name,
    revision: tour.revision,
    images: tour.images,
    days: tour.days.map((day) => ({
      id: day.id,
      title: day.title,
      mealNote: day.mealNote,
      stops: day.stops.map((stop) => ({
        id: stop.id,
        type: activityTypeSchema.parse(stop.type),
        title: stop.title,
        content: stop.content,
        placeName: stop.placeName,
      })),
    })),
  };
}
