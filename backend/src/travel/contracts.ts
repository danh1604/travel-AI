import { z } from "zod";

export const travelKinds = ["destinations", "hotels", "restaurants", "attractions", "transportations"] as const;
export type TravelKind = (typeof travelKinds)[number];
export const serviceKinds = ["hotels", "restaurants", "attractions", "transportations"] as const;
export type ServiceKind = (typeof serviceKinds)[number];
export const travelKind = z.enum(travelKinds);
export const transportModes = ["FLIGHT", "TRAIN", "BUS", "CAR", "TAXI", "MOTORBIKE", "BOAT"] as const;
export const dataSources = ["DEMO", "INTERNAL", "EXTERNAL_API"] as const;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const tags = z.array(text(1, 40)).max(20).default([]);
// Money stays an integer string end-to-end; JS numbers are not used for VND amounts.
const priceVnd = z.string().regex(/^\d{1,12}$/);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const minutes = z.number().int().min(1).max(10_080);
const common = {
  name: text(2, 200),
  slug: text(1, 200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(4000).default(""),
  source: z.enum(dataSources).default("INTERNAL"),
  sourceUrl: z.string().trim().url().max(500).refine((url) => url.startsWith("https://")).nullable().default(null),
  isActive: z.boolean().default(true),
};
const place = {
  ...common,
  destinationId: z.string().uuid(),
  address: text(1, 300),
  latitude: latitude.nullable().default(null),
  longitude: longitude.nullable().default(null),
  priceVnd,
  tags,
};

// Cost units mirror the CHECK constraints in the initial migration.
export const travelInputs = {
  destinations: z.object({ ...common, province: text(2, 120), latitude, longitude, tags }).strict(),
  hotels: z.object({ ...place, costUnit: z.literal("PER_ROOM_NIGHT").default("PER_ROOM_NIGHT"), roomCapacity: z.number().int().min(1).max(20) }).strict(),
  restaurants: z.object({ ...place, costUnit: z.literal("PER_PERSON").default("PER_PERSON"), foodOptions: tags }).strict(),
  attractions: z.object({ ...place, costUnit: z.enum(["PER_PERSON", "PER_GROUP"]), durationMinutes: minutes, isIndoor: z.boolean() }).strict(),
  transportations: z.object({
    ...common, destinationId: z.string().uuid(), departure: text(2, 120), mode: z.enum(transportModes), priceVnd,
    costUnit: z.enum(["PER_PERSON", "PER_PERSON_ROUND_TRIP", "PER_VEHICLE_TRIP", "PER_GROUP"]),
    capacity: z.number().int().min(1).max(500), durationMinutes: minutes,
  }).strict(),
} satisfies Record<TravelKind, z.ZodTypeAny>;
export type TravelInput<K extends TravelKind = TravelKind> = z.infer<(typeof travelInputs)[K]>;
export const travelUpdate = z.object({ revision: z.number().int().min(1).max(2147483646) }).passthrough();

export type TravelRecord = Record<string, unknown> & {
  id: string; slug: string; name: string; isActive: boolean; revision: number; updatedAt: string;
  destinationId?: string; destinationName?: string; destinationSlug?: string; priceVnd?: string; tags?: string[];
};
export type DestinationSummary = TravelRecord & { counts: Record<ServiceKind, number> };

export const adminListQuery = z.object({
  q: z.string().trim().max(100).default(""),
  destinationId: z.string().uuid().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).strict();
export const publicServiceQuery = z.object({
  destination: z.string().trim().max(200).regex(/^[a-z0-9-]*$/).default(""),
  q: z.string().trim().max(100).default(""),
  tag: z.string().trim().max(40).default(""),
  maxPrice: z.string().regex(/^\d{1,12}$/).optional(),
  sort: z.enum(["price", "name"]).default("price"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(12),
}).strict();
export type PublicServiceQuery = z.infer<typeof publicServiceQuery>;

export class TravelWriteError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[đĐ]/g, "d").toLowerCase();
