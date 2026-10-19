import type { PrismaClient } from "../generated/prisma/client.js";
import type { MappingPlan } from "./mapping.js";

// Create-only import: reruns do not duplicate records or overwrite admin changes.
export async function persistMappingPlan(database: PrismaClient, plan: MappingPlan) {
  return database.$transaction(async (tx) => ({
    categories: (await tx.tourCategory.createMany({ data: plan.categories, skipDuplicates: true })).count,
    places: (await tx.catalogPlace.createMany({ data: plan.places, skipDuplicates: true })).count,
    services: (await tx.catalogService.createMany({ data: plan.services, skipDuplicates: true })).count,
    tours: (await tx.tour.createMany({ data: plan.tours, skipDuplicates: true })).count,
    departures: (await tx.tourDeparture.createMany({ data: plan.departures, skipDuplicates: true })).count,
    departureServices: (await tx.departureService.createMany({ data: plan.departureServices, skipDuplicates: true })).count,
    days: (await tx.tourDay.createMany({ data: plan.days, skipDuplicates: true })).count,
    stops: (await tx.tourStop.createMany({ data: plan.stops, skipDuplicates: true })).count,
    images: (await tx.catalogImage.createMany({ data: plan.images, skipDuplicates: true })).count,
    sections: (await tx.tourSection.createMany({ data: plan.sections, skipDuplicates: true })).count,
    discounts: (await tx.tourDiscount.createMany({ data: plan.discounts, skipDuplicates: true })).count,
  }), { timeout: 60_000 });
}
