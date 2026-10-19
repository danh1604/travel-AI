
import { z } from "zod";
import { CatalogWriteError } from "./admin-contracts.js";

const image = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  });
export const activityTypeSchema = z.enum([
  "visit",
  "move",
  "eat",
  "rest",
  "other",
]);
const stop = z
  .object({
    id: z.string().uuid().optional(),
    type: activityTypeSchema,
    title: z.string().trim().min(1).max(200),
    content: z.string().max(20_000),
    placeName: z.string().trim().max(200).nullable(),
  })
  .strict();
const day = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    mealNote: z.string().trim().max(4000).nullable(),
    stops: z.array(stop).max(100),
  })
  .strict();
export const tourContentInput = z
  .object({
    revision: z.number().int().positive(),
    images: z.array(image).max(40),
    days: z.array(day).max(60),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.images).size !== value.images.length)
      ctx.addIssue({
        code: "custom",
        path: ["images"],
        message: "Duplicate image URL",
      });
    for (const ids of [
      value.days.map((item) => item.id),
      value.days.flatMap((item) => item.stops.map((entry) => entry.id)),
    ]) {
      const present = ids.filter((id) => id !== undefined);
      if (new Set(present).size !== present.length)
        ctx.addIssue({
          code: "custom",
          path: ["days"],
          message: "Duplicate child ID",
        });
    }
  });
export type TourContentInput = z.infer<typeof tourContentInput>;
export type TourContent = {
  id: string;
  name: string;
  revision: number;
  images: string[];
  days: TourContentInput["days"];
};

export function checkContentOwnership(
  input: TourContentInput,
  dayIds: Set<string>,
  stopIds: Set<string>,
) {
  if (
    input.days.some(
      (day) =>
        (day.id && !dayIds.has(day.id)) ||
        day.stops.some((stop) => stop.id && !stopIds.has(stop.id)),
    )
  ) {
    throw new CatalogWriteError(400, "invalid_child");
  }
}
