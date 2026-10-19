import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";

export const catalogCollections = ["categories", "tours", "places", "services", "trips", "itineraries", "itinerary_details", "tour_images", "place_images", "descriptions", "sales"] as const;
export type CatalogCollection = typeof catalogCollections[number];
export type LegacyDataset = Partial<Record<CatalogCollection, Record<string, unknown>[]>>;
export type MappingIssue = { collection: string; sourceId: string; code: string; severity: "warning" | "rejected" };

export function sourceId(value: unknown): string {
  const candidate = typeof value === "string" ? value : value && typeof value === "object" && "toHexString" in value && typeof value.toHexString === "function" ? value.toHexString() : undefined;
  if (typeof candidate !== "string" || !/^[a-f\d]{24}$/i.test(candidate)) throw new MappingError("INVALID_SOURCE_ID");
  return candidate.toLowerCase();
}

export function catalogId(database: string, collection: string, id: string): string {
  const hex = createHash("sha256").update(JSON.stringify([database, collection, id])).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

class MappingError extends Error {
  constructor(readonly code: string) { super(code); }
}
function text(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new MappingError("INVALID_TEXT");
  return allowEmpty ? value : value.trim();
}
function integer(value: unknown, min: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > 2_147_483_647) throw new MappingError("INVALID_INTEGER");
  return value;
}
function amount(value: unknown, positive = false): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (positive && value === 0)) throw new MappingError("INVALID_AMOUNT");
  return String(value);
}
function date(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new MappingError("INVALID_DATE");
  return value;
}
function allowed(value: unknown, options: string[]): string {
  const result = text(value);
  if (!options.includes(result)) throw new MappingError("UNKNOWN_ENUM_VALUE");
  return result;
}

export function buildMappingPlan(sourceDatabase: string, dataset: LegacyDataset) {
  if (!sourceDatabase.trim()) throw new MappingError("INVALID_DATABASE_NAME");
  const plan = {
    categories: [] as Prisma.TourCategoryCreateManyInput[],
    tours: [] as Prisma.TourCreateManyInput[],
    places: [] as Prisma.CatalogPlaceCreateManyInput[],
    services: [] as Prisma.CatalogServiceCreateManyInput[],
    departures: [] as Prisma.TourDepartureCreateManyInput[],
    departureServices: [] as Prisma.DepartureServiceCreateManyInput[],
    days: [] as Prisma.TourDayCreateManyInput[],
    stops: [] as Prisma.TourStopCreateManyInput[],
    images: [] as Prisma.CatalogImageCreateManyInput[],
    sections: [] as Prisma.TourSectionCreateManyInput[],
    discounts: [] as Prisma.TourDiscountCreateManyInput[],
    issues: [] as MappingIssue[],
  };
  const accepted = new Map<string, Map<string, string>>();
  const uniqueDays = new Set<string>();
  const uniqueStops = new Set<string>();
  function issue(collection: string, id: string, code: string, severity: MappingIssue["severity"] = "rejected") {
    plan.issues.push({ collection, sourceId: id, code, severity });
  }
  function ref(collection: string, value: unknown): string {
    const result = accepted.get(collection)?.get(sourceId(value));
    if (!result) throw new MappingError(`MISSING_REFERENCE_${collection.toUpperCase()}`);
    return result;
  }
  function visit<T>(collection: CatalogCollection, target: T[], parse: (document: Record<string, unknown>, base: { id: string; sourceDatabase: string; sourceId: string }) => T) {
    const index = new Map<string, string>();
    accepted.set(collection, index);
    for (const document of dataset[collection] ?? []) {
      let id = "invalid-id";
      try {
        id = sourceId(document._id);
        if (index.has(id)) throw new MappingError("DUPLICATE_SOURCE_ID");
        const base = { id: catalogId(sourceDatabase, collection, id), sourceDatabase, sourceId: id };
        const record = parse(document, base);
        target.push(record);
        index.set(id, base.id);
      } catch (error) {
        if (!(error instanceof MappingError)) throw error;
        issue(collection, id, error.code);
      }
    }
  }

  visit("categories", plan.categories, (d, base) => ({ ...base, name: text(d.name), slug: text(d.slug), status: allowed(d.status, ["active", "inactive"]) }));
  visit("places", plan.places, (d, base) => ({ ...base, name: text(d.title), content: text(d.content, true), needsReview: true }));
  visit("services", plan.services, (d, base) => ({
    ...base, name: text(d.serviceName), type: allowed(d.type, ["hotel", "restaurant", "transport", "ticket", "guide", "other"]),
    unit: allowed(d.unit, ["per_room", "per_day", "per_meal", "per_person"]), basePriceVnd: amount(d.basePrice),
    description: text(d.description, true), status: allowed(d.status, ["active", "inactive"]),
    sourceUpdatedAt: d.updatedAt == null ? null : date(d.updatedAt), needsReview: true,
  }));
  visit("tours", plan.tours, (d, base) => {
    const record = {
      ...base, name: text(d.name), slug: text(d.slug), status: allowed(d.status, ["active", "inactive"]),
      departureLocation: text(d.start_location), categoryId: ref("categories", d.category_id),
      durationDays: d.duration == null ? null : integer(d.duration, 1),
      legacyHotelId: d.hotel_id == null ? null : sourceId(d.hotel_id), needsReview: true,
      sourceUpdatedAt: d.updatedAt == null ? null : date(d.updatedAt),
    };
    if (record.legacyHotelId) issue("tours", base.sourceId, "UNRESOLVED_LEGACY_HOTEL", "warning");
    if (record.durationDays === null) issue("tours", base.sourceId, "MISSING_EXPLICIT_DURATION", "warning");
    return record;
  });
  visit("trips", plan.departures, (d, base) => {
    const startsAt = date(d.start_date), endsAt = date(d.end_date);
    const minPeople = integer(d.min_people, 1), maxPeople = integer(d.max_people, 1), bookedPeople = integer(d.booked_people, 0);
    if (endsAt < startsAt) throw new MappingError("REVERSED_DATE_RANGE");
    if (maxPeople < minPeople || bookedPeople > maxPeople) throw new MappingError("INVALID_CAPACITY");
    return {
      ...base, tourId: ref("tours", d.tour_id), startsAt, endsAt,
      basePriceVnd: amount(d.base_price), salePriceVnd: amount(d.price), minPeople, maxPeople, bookedPeople,
      status: allowed(d.status, ["open", "closed", "full", "deleted"]), needsReview: true,
      sourceUpdatedAt: d.updatedAt == null ? null : date(d.updatedAt),
    };
  });
  for (const d of dataset.trips ?? []) {
    let id = "invalid-id";
    try {
      id = sourceId(d._id);
      const departureId = accepted.get("trips")?.get(id);
      if (!departureId) continue;
      if (!Array.isArray(d.services)) { issue("trips", id, "INVALID_SERVICE_LIST"); continue; }
      for (const [position, entry] of d.services.entries()) {
        try {
          if (!entry || typeof entry !== "object") throw new MappingError("INVALID_SERVICE_LINE");
          const item = entry as Record<string, unknown>;
          plan.departureServices.push({
            id: catalogId(sourceDatabase, "departure_services", `${id}:${position}`), departureId,
            serviceId: ref("services", item.service_id), position,
            unitPriceVnd: amount(item.unit_price), quantity: amount(item.quantity, true),
            note: item.note == null ? null : text(item.note, true),
          });
        } catch (error) {
          if (!(error instanceof MappingError)) throw error;
          issue("trip_services", `${id}:${position}`, error.code);
        }
      }
    } catch (error) { if (!(error instanceof MappingError)) throw error; }
  }
  visit("itineraries", plan.days, (d, base) => {
    const record = { ...base, tourId: ref("tours", d.tour_id), dayNumber: integer(d.day_number, 1), title: text(d.title), mealNote: d.meal_note == null ? null : text(d.meal_note, true) };
    const key = `${record.tourId}:${record.dayNumber}`;
    if (uniqueDays.has(key)) issue("itineraries", base.sourceId, "DUPLICATE_TOUR_DAY", "warning");
    uniqueDays.add(key);
    return record;
  });
  visit("itinerary_details", plan.stops, (d, base) => {
    const record = {
      ...base, dayId: ref("itineraries", d.itinerary_id), placeId: d.place_id == null ? null : ref("places", d.place_id),
      type: allowed(d.type, ["eat", "move", "other", "rest", "visit"]), title: text(d.title), content: text(d.content, true), position: integer(d.order, 0),
    };
    const key = `${record.dayId}:${record.position}`;
    if (uniqueStops.has(key)) issue("itinerary_details", base.sourceId, "DUPLICATE_STOP_POSITION", "warning");
    uniqueStops.add(key);
    return record;
  });
  for (const collection of ["tour_images", "place_images"] as const) {
    visit(collection, plan.images, (d, base) => {
      const url = text(d.image_url);
      let parsed: URL;
      try { parsed = new URL(url); } catch { throw new MappingError("INVALID_IMAGE_URL"); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new MappingError("INVALID_IMAGE_URL");
      return {
        ...base, sourceCollection: collection, url, storagePublicId: d.public_id == null ? null : text(d.public_id),
        tourId: collection === "tour_images" ? ref("tours", d.tour_id) : null,
        placeId: collection === "place_images" ? ref("places", d.place_id) : null,
      };
    });
  }
  visit("descriptions", plan.sections, (d, base) => ({ ...base, tourId: ref("tours", d.tour_id), title: text(d.title), content: text(d.content, true) }));
  visit("sales", plan.discounts, (d, base) => {
    const percentage = amount(d.discount);
    if (Number(percentage) > 100 || !Number.isInteger(Number(percentage) * 100)) throw new MappingError("INVALID_DISCOUNT");
    return { ...base, tourId: ref("tours", d.tour_id), percentage, needsReview: true };
  });
  return plan;
}

export type MappingPlan = ReturnType<typeof buildMappingPlan>;

export function mappingSummary(plan: MappingPlan, dataset: LegacyDataset) {
  const sourceCounts = Object.fromEntries(catalogCollections.map((collection) => [collection, dataset[collection]?.length ?? 0]));
  const targetCounts = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "issues").map(([key, rows]) => [key, rows.length]));
  const issueCounts: Record<string, number> = {};
  for (const issue of plan.issues) issueCounts[`${issue.severity}:${issue.code}`] = (issueCounts[`${issue.severity}:${issue.code}`] ?? 0) + 1;
  return { sourceCounts, targetCounts, issueCounts, requiresReview: true };
}
