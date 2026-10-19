import type { MappingPlan } from "../legacy/mapping.js";
import { snapshotSchema, type CatalogSnapshot } from "./contracts.js";
import { departureSummary } from "./departure-contracts.js";

// Explicit public projection. Never export raw legacy documents, service costs, users or bookings.
export function projectCatalog(plan: MappingPlan, generatedAt = new Date().toISOString()): CatalogSnapshot {
  const activeCategories = plan.categories.filter((category) => category.status === "active");
  const categories = activeCategories.map((category) => ({ id: category.id, name: category.name, slug: category.slug }));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const placeById = new Map(plan.places.map((place) => [place.id, place.name]));
  const now = new Date(generatedAt);
  const tours = plan.tours.filter((tour) => tour.status === "active" && categoryById.has(tour.categoryId)).map((tour) => {
    const images = plan.images.filter((image) => image.tourId === tour.id && !image.isHidden)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id)).map((image) => image.url);
    const departures = plan.departures.filter((departure) => departure.tourId === tour.id && departure.status !== "deleted")
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()).map((departure) => ({
        id: departure.id, startsAt: new Date(departure.startsAt).toISOString(), endsAt: new Date(departure.endsAt).toISOString(),
        sourcePriceVnd: String(departure.salePriceVnd), status: departure.status, needsReview: departure.needsReview ?? true,
        priceConfirmed: departure.priceConfirmed ?? false, availableSeats: departure.maxPeople - departure.bookedPeople,
      }));
    return {
      id: tour.id, slug: tour.slug, name: tour.name, category: categoryById.get(tour.categoryId)!,
      departureLocation: tour.departureLocation, durationDays: tour.durationDays ?? null, images, coverImage: images[0] ?? null,
      ...departureSummary(departures, now.getTime()), needsReview: tour.needsReview ?? true,
      days: plan.days.filter((day) => day.tourId === tour.id && !day.isHidden).sort((a, b) => a.dayNumber - b.dayNumber || a.id.localeCompare(b.id)).map((day) => ({
        id: day.id, dayNumber: day.dayNumber, title: day.title, mealNote: day.mealNote ?? null,
        stops: plan.stops.filter((stop) => stop.dayId === day.id && !stop.isHidden).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((stop) => ({
          id: stop.id, type: stop.type, title: stop.title, content: stop.content, position: stop.position,
          placeName: stop.placeLabel != null ? stop.placeLabel || null : stop.placeId ? placeById.get(stop.placeId) ?? null : null,
        })),
      })),
      sections: plan.sections.filter((section) => section.tourId === tour.id).map((section) => ({ id: section.id, title: section.title, content: section.content })),
      departures,
    };
  });
  return snapshotSchema.parse({ version: 1, generatedAt, categories, tours });
}
