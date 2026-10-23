import { z } from "zod";
import { dateOnly } from "../planner/contracts.js";

const DAY = 86_400_000;
const VN_OFFSET = 7 * 3_600_000;
// Safety bound on one tour; far above what a real schedule needs.
const MAX_PER_TOUR = 100;

export const refreshInput = z
  .object({
    startDate: dateOnly,
    gapDays: z.number().int().min(1).max(90),
    tourId: z.string().uuid().optional(),
    dryRun: z.boolean(),
  })
  .strict();
export type RefreshInput = z.infer<typeof refreshInput>;

export type RefreshDeparture = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  bookedPeople: number | null;
  // True when a refresh copy of this departure already exists, so it is not copied again.
  cloned?: boolean;
};
export type RefreshTourInput = {
  id: string;
  name: string;
  status: "active" | "inactive";
  departures: RefreshDeparture[];
};
export type RefreshChange = {
  departureId: string;
  // "move" re-dates a past departure that never had guests; "clone" keeps the
  // historical departure (it had guests) and adds a fresh one on the new date.
  action: "move" | "clone";
  from: string;
  to: string;
  endsAt: string;
};
export type RefreshTourResult = { id: string; name: string; changes: RefreshChange[] };
export type RefreshResult = {
  dryRun: boolean;
  startDate: string;
  tours: RefreshTourResult[];
  summary: { tours: number; moved: number; cloned: number };
};

export function vnToday(now: number) {
  return new Date(now + VN_OFFSET).toISOString().slice(0, 10);
}

/**
 * Pure planner shared by the local and PostgreSQL repositories. For each eligible
 * tour, every past departure is re-dated onto future days in the original order,
 * keeping time of day and duration.
 */
export function planRefresh(tours: RefreshTourInput[], input: RefreshInput, now: number): RefreshResult {
  const base = Date.parse(`${input.startDate}T00:00:00+07:00`);
  const results: RefreshTourResult[] = [];
  for (const tour of tours) {
    if (input.tourId ? tour.id !== input.tourId : tour.status !== "active") continue;
    const past = tour.departures
      .filter((item) => item.status !== "deleted" && !item.cloned && Date.parse(item.startsAt) < now)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id))
      .slice(-MAX_PER_TOUR);
    const changes: RefreshChange[] = [];
    let previous = Number.NEGATIVE_INFINITY;
    past.forEach((item, index) => {
      const start = Date.parse(item.startsAt);
      const timeOfDay = (((start + VN_OFFSET) % DAY) + DAY) % DAY;
      let next = base + index * input.gapDays * DAY + timeOfDay;
      // A departure that already left today (or sits in the next hour) is useless; push by whole days.
      while (next < now + 3_600_000) next += DAY;
      while (next <= previous) next += DAY;
      previous = next;
      const length = Math.max(0, Date.parse(item.endsAt) - start);
      changes.push({
        departureId: item.id,
        action: item.bookedPeople !== null && item.bookedPeople > 0 ? "clone" : "move",
        from: item.startsAt,
        to: new Date(next).toISOString(),
        endsAt: new Date(next + length).toISOString(),
      });
    });
    if (changes.length) results.push({ id: tour.id, name: tour.name, changes });
  }
  const all = results.flatMap((item) => item.changes);
  return {
    dryRun: input.dryRun,
    startDate: input.startDate,
    tours: results,
    summary: {
      tours: results.length,
      moved: all.filter((item) => item.action === "move").length,
      cloned: all.filter((item) => item.action === "clone").length,
    },
  };
}
