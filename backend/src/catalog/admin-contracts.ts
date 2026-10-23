import { z } from "zod";
import type { TourContent, TourContentInput } from "./content-contracts.js";
import type { DepartureInput, DepartureList } from "./departure-contracts.js";
import type { RefreshInput, RefreshResult } from "./departure-refresh.js";

const base = z
  .object({
    name: z.string().trim().min(2).max(200),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    status: z.enum(["active", "inactive"]),
  })
  .strict();
export const categoryInput = base;
export const tourInput = base.extend({
  categoryId: z.string().uuid(),
  departureLocation: z.string().trim().min(2).max(200),
  durationDays: z.number().int().min(1).max(365).nullable(),
});
export const categoryUpdate = categoryInput.extend({
  revision: z.number().int().positive(),
});
export const tourUpdate = tourInput.extend({
  revision: z.number().int().positive(),
});
export type CategoryInput = z.infer<typeof categoryInput>;
export type TourInput = z.infer<typeof tourInput>;
export type AdminCategory = CategoryInput & { id: string; revision: number };
export type AdminTour = TourInput & {
  id: string;
  revision: number;
  needsReview: boolean;
};
export type AdminTourRow = AdminTour & { upcomingDepartures: number; totalDepartures: number };
export type AdminData = { categories: AdminCategory[]; tours: AdminTourRow[] };
export class CatalogWriteError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export interface AdminCatalogRepository {
  getDepartures(id: string): Promise<DepartureList>;
  saveDeparture(id: string, input: DepartureInput, departureId?: string): Promise<DepartureList>;
  archiveDeparture(id: string, departureId: string, revision: number): Promise<DepartureList>;
  closeDeparture(id: string, departureId: string, revision: number): Promise<DepartureList>;
  archivePastDepartures(id: string, revision: number): Promise<DepartureList>;
  getContent(id: string): Promise<TourContent>;
  saveContent(id: string, input: TourContentInput): Promise<TourContent>;
  refreshDepartures(input: RefreshInput): Promise<RefreshResult>;
  deleteTour(id: string, revision: number): Promise<void>;
  list(): Promise<AdminData>;
  saveCategory(
    input: CategoryInput,
    id?: string,
    revision?: number,
  ): Promise<AdminCategory>;
  saveTour(
    input: TourInput,
    id?: string,
    revision?: number,
  ): Promise<AdminTour>;
}
