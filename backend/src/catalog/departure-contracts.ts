import { z } from "zod";

const amount = z
  .string()
  .trim()
  .regex(/^\d{1,35}(?:\.\d{1,30})?$/);
export const departureInput = z
  .object({
    revision: z.number().int().positive(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    basePriceVnd: amount,
    salePriceVnd: amount,
    priceConfirmed: z.boolean(),
    minPeople: z.number().int().min(1).max(100000),
    maxPeople: z.number().int().min(1).max(100000),
    bookedPeople: z.number().int().min(0).max(100000),
    status: z.enum(["open", "closed", "full"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Date.parse(value.endsAt) < Date.parse(value.startsAt))
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Ngày về phải sau hoặc bằng ngày đi.",
      });
    if (
      value.minPeople > value.maxPeople ||
      value.bookedPeople > value.maxPeople
    )
      ctx.addIssue({
        code: "custom",
        path: ["maxPeople"],
        message: "Số chỗ không hợp lệ.",
      });
    if (value.status === "open" && value.bookedPeople >= value.maxPeople)
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Lịch mở phải còn chỗ.",
      });
    if (value.status === "full" && value.bookedPeople !== value.maxPeople)
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Lịch hết chỗ phải có số đã đặt bằng tổng chỗ.",
      });
    if (value.priceConfirmed && !/^(0|[1-9]\d{0,11})$/.test(value.salePriceVnd))
      ctx.addIssue({
        code: "custom",
        path: ["salePriceVnd"],
        message: "Giá xác nhận phải là số nguyên VNĐ từ 0 đến 999999999999.",
      });
  });
export const departureArchive = z
  .object({ revision: z.number().int().positive() })
  .strict();
export type DepartureInput = z.infer<typeof departureInput>;
export type AdminDeparture = Omit<
  DepartureInput,
  "revision" | "basePriceVnd" | "minPeople" | "maxPeople" | "bookedPeople"
> & {
  id: string;
  basePriceVnd: string | null;
  minPeople: number | null;
  maxPeople: number | null;
  bookedPeople: number | null;
};
export type DepartureList = {
  id: string;
  name: string;
  revision: number;
  departures: AdminDeparture[];
};

export function compareAmounts(a: string, b: string) {
  const scaled = (value: string) => {
    const [integer, fraction = ""] = value.split(".");
    return BigInt(integer + fraction.padEnd(30, "0"));
  };
  const left = scaled(a),
    right = scaled(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
export function departureSummary(
  departures: {
    startsAt: string;
    status: string;
    sourcePriceVnd: string;
    priceConfirmed?: boolean;
    availableSeats?: number | null;
  }[],
  now = Date.now(),
) {
  const upcoming = departures.filter(
    (item) =>
      item.status === "open" &&
      Date.parse(item.startsAt) >= now &&
      item.availableSeats !== 0,
  );
  return {
    upcomingDepartures: upcoming.length,
    sourcePriceVnd:
      upcoming.map((item) => item.sourcePriceVnd).sort(compareAmounts)[0] ??
      null,
    priceVnd:
      upcoming
        .filter((item) => item.priceConfirmed)
        .map((item) => item.sourcePriceVnd)
        .sort(compareAmounts)[0] ?? null,
  };
}

/** A tour with an upcoming departure that has guests must be handled by hand, never deleted in bulk. */
export function hasUpcomingGuests(
  departures: { startsAt: string | Date; bookedPeople: number | null }[],
  now = Date.now(),
) {
  return departures.some(
    (item) => new Date(item.startsAt).getTime() >= now && (item.bookedPeople ?? 0) > 0,
  );
}

/** Past departures are history and can always be removed; upcoming ones only when known to have no guests. */
export function canArchiveDeparture(startsAt: string | Date, bookedPeople: number | null, now = Date.now()) {
  return new Date(startsAt).getTime() < now || bookedPeople === 0;
}
