import { z } from "zod";

const category = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() });
const image = z.string().url().refine((value) => value.startsWith("https://"));
const amount = z.string().regex(/^\d+(?:\.\d+)?$/);
export const tourSummarySchema = z.object({
  id: z.string().uuid(), slug: z.string(), name: z.string(), category,
  departureLocation: z.string(), durationDays: z.number().int().positive().nullable(),
  coverImage: image.nullable(), sourcePriceVnd: amount.nullable(), upcomingDepartures: z.number().int().nonnegative(), needsReview: z.boolean(),
  priceVnd: amount.nullable().default(null),
});
export const tourDetailSchema = tourSummarySchema.extend({
  images: z.array(image),
  days: z.array(z.object({ id: z.string().uuid(), dayNumber: z.number().int().positive(), title: z.string(), mealNote: z.string().nullable(),
    stops: z.array(z.object({ id: z.string().uuid(), type: z.string(), title: z.string(), content: z.string(), position: z.number().int().nonnegative(), placeName: z.string().nullable() })),
  })),
  sections: z.array(z.object({ id: z.string().uuid(), title: z.string(), content: z.string() })),
  departures: z.array(z.object({ id: z.string().uuid(), startsAt: z.string().datetime(), endsAt: z.string().datetime(), sourcePriceVnd: amount, status: z.enum(["open", "closed", "full"]), needsReview: z.boolean(), priceConfirmed: z.boolean().default(false), availableSeats: z.number().int().nonnegative().nullable().default(null) })),
});
export const snapshotSchema = z.object({
  version: z.literal(1), generatedAt: z.string().datetime(), categories: z.array(category), tours: z.array(tourDetailSchema),
});
export type CatalogSnapshot = z.infer<typeof snapshotSchema>;
export type TourDetail = z.infer<typeof tourDetailSchema>;
export type CatalogQuery = { q: string; category: string; page: number; limit: number };

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).default(""), category: z.union([z.literal(""), z.string().uuid()]).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(24).default(9),
}).strict();

export function catalogMetadata(source: "snapshot" | "postgres", generatedAt: string | null) {
  return { source, generatedAt, developmentData: source === "snapshot", priceUnit: "unconfirmed" as const };
}
