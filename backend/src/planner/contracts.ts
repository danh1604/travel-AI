import { z } from "zod";

export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
});
export const constraintsSchema = z.object({
  destination: z.string().trim().min(2).max(100).nullable(),
  days: z.number().int().min(1).max(14).nullable(),
  people: z.number().int().min(1).max(50).nullable(),
  budgetVnd: z.number().int().min(1).max(1_000_000_000_000).nullable(),
  startDate: dateOnly.nullable(),
  style: z.enum(["relaxed", "balanced", "active"]),
}).strict();
export const plannerRequest = z.object({
  prompt: z.string().trim().min(5).max(2000),
  destination: z.string().trim().min(2).max(100).optional(),
  days: z.number().int().min(1).max(14).optional(),
  people: z.number().int().min(1).max(50).optional(),
  budgetVnd: z.number().int().min(1).max(1_000_000_000_000).optional(),
  startDate: dateOnly.optional(),
  style: z.enum(["relaxed", "balanced", "active"]).optional(),
}).strict();
export const selectedPlan = z.object({
  days: z.array(z.object({
    dayNumber: z.number().int().min(1).max(14),
    activities: z.array(z.object({ ref: z.string().min(1).max(40), period: z.enum(["morning", "afternoon", "evening"]) }).strict()).max(6),
  }).strict()).min(1).max(14),
}).strict();
export type PlannerRequest = z.infer<typeof plannerRequest>;
export type Constraints = z.infer<typeof constraintsSchema>;
export type PlanSelection = z.infer<typeof selectedPlan>;

export const constraintsParameters = {
  type: "object", additionalProperties: false,
  properties: {
    destination: { type: ["string", "null"], description: "Điểm đến, không phải nơi khởi hành. Không đoán nếu thiếu." },
    days: { type: ["integer", "null"], minimum: 1, maximum: 14 },
    people: { type: ["integer", "null"], minimum: 1, maximum: 50 },
    budgetVnd: { type: ["integer", "null"], description: "Tổng ngân sách cả nhóm bằng VND. Nhân số người nếu người dùng nói ngân sách/người. Không đoán số người hoặc ngân sách.", minimum: 1, maximum: 1_000_000_000_000 },
    startDate: { type: ["string", "null"], description: "YYYY-MM-DD. Không tự chọn nếu chưa có ngày đi." },
    style: { type: "string", enum: ["relaxed", "balanced", "active"] },
  }, required: ["destination", "days", "people", "budgetVnd", "startDate", "style"],
};
export const selectionParameters = {
  type: "object", additionalProperties: false,
  properties: { days: { type: "array", items: {
    type: "object", additionalProperties: false,
    properties: { dayNumber: { type: "integer" }, activities: { type: "array", maxItems: 6, items: {
      type: "object", additionalProperties: false,
      properties: { ref: { type: "string" }, period: { type: "string", enum: ["morning", "afternoon", "evening"] } }, required: ["ref", "period"],
    } } }, required: ["dayNumber", "activities"],
  } } }, required: ["days"],
};
