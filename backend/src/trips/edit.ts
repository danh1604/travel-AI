import { z } from "zod";
import { dateOnly } from "../planner/contracts.js";
import type { ReadyPlan } from "./repository.js";

export const tripEdit = z.object({
  revision: z.number().int().positive(), title: z.string().trim().min(1).max(160),
  startDate: dateOnly.nullable(), notes: z.string().max(5000),
  days: z.array(z.object({ dayNumber: z.number().int().min(1).max(14), note: z.string().max(1000),
    activities: z.array(z.object({ ref: z.string().min(1).max(40), period: z.enum(["morning", "afternoon", "evening"]), note: z.string().max(1000) }).strict()).max(6),
  }).strict()).min(1).max(14),
}).strict();
export type TripEdit = z.infer<typeof tripEdit>;
export class TripEditError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function applyTripEdit(original: ReadyPlan, edit: TripEdit, updatedAt: string): ReadyPlan {
  if (edit.days.length !== original.days.length) throw new TripEditError(400, "invalid_trip_days");
  const sources = new Map(original.days.flatMap((d) => d.activities.map((a) => [a.ref, a] as const)));
  const seen = new Set<string>(), order = { morning: 0, afternoon: 1, evening: 2 };
  const days = edit.days.map((day, index) => {
    if (day.dayNumber !== index + 1) throw new TripEditError(400, "invalid_trip_days");
    let last = -1;
    return { ...original.days[index], note: day.note,
      date: edit.startDate ? new Date(Date.parse(edit.startDate) + index * 86400_000).toISOString().slice(0, 10) : null,
      activities: day.activities.map((a) => {
        const source = sources.get(a.ref);
        if (!source || seen.has(a.ref) || order[a.period] < last) throw new TripEditError(400, "invalid_trip_activities");
        seen.add(a.ref); last = order[a.period];
        return { ...source, period: a.period, note: a.note };
      }),
    };
  });
  if (!seen.size) throw new TripEditError(400, "empty_trip");
  const changedDate = edit.startDate !== original.constraints.startDate;
  const warning = "Lịch trình đã được chỉnh sửa thủ công; cần kiểm tra lại thời gian, dịch vụ và chi phí.";
  return { ...original, days, constraints: { ...original.constraints, startDate: edit.startDate },
    weather: changedDate ? { status: "outside_forecast", days: [] } : original.weather,
    packageQuotes: changedDate ? [] : original.packageQuotes,
    warnings: [...original.warnings.filter((w) => w !== warning), warning], manualEdit: { updatedAt },
  };
}
