import { randomUUID } from "node:crypto";
import type { AccountSql } from "../auth/account-admin.js";
import type { generatePlan } from "../planner/service.js";
import { applyTripEdit, TripEditError, type TripEdit } from "./edit.js";

type GeneratedPlan = Extract<Awaited<ReturnType<typeof generatePlan>>, { status: "ready" }>;
export type ReadyPlan = Omit<GeneratedPlan, "days"> & { manualEdit?: { updatedAt: string }; days: (Omit<GeneratedPlan["days"][number], "activities"> & { note?: string; activities: (GeneratedPlan["days"][number]["activities"][number] & { note?: string })[] })[] };
export type SavedTrip = { id: string; title: string; notes: string; revision: number; updatedAt: string; createdAt: string; savedAt: string; plan: ReadyPlan };
export type TripSummary = { id: string; title: string; destination: string | null; days: number | null; people: number | null; startDate: string | null; budgetVnd: number | null; savedAt: string };
export interface SavedPlanRepository {
  createPlanDraft(ownerId: string, plan: ReadyPlan): Promise<string>;
  savePlan(ownerId: string, id: string): Promise<{ id: string; savedAt: string } | null>;
  listSavedPlans(ownerId: string, page: number, limit: number): Promise<{ data: TripSummary[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>;
  getSavedPlan(ownerId: string, id: string): Promise<SavedTrip | null>;
  deleteSavedPlan(ownerId: string, id: string): Promise<boolean>;
  editSavedPlan(ownerId: string, id: string, edit: TripEdit): Promise<SavedTrip>;
}
const iso = (v: Date | string) => new Date(v).toISOString();
export function createSavedPlanRepository(db: AccountSql): SavedPlanRepository {
  return {
    async createPlanDraft(ownerId, plan) {
      // Remove expired, unsaved drafts only. Saved trips have no expiration.
      await db.query('DELETE FROM "SavedPlan" WHERE "ownerId"=$1 AND "savedAt" IS NULL AND "createdAt" < now()-interval \'7 days\' RETURNING id', [ownerId]);
      const id = randomUUID();
      await db.query('INSERT INTO "SavedPlan" (id,"ownerId",snapshot) VALUES ($1,$2,$3::jsonb) RETURNING id', [id, ownerId, JSON.stringify(plan)]);
      return id;
    },
    async savePlan(ownerId, id) {
      // Idempotent: clicking/retrying Save never creates a second trip.
      const row = (await db.query<{ id: string; savedAt: Date | string }>('UPDATE "SavedPlan" SET "savedAt"=COALESCE("savedAt",now()) WHERE id=$1 AND "ownerId"=$2 RETURNING id,"savedAt"', [id, ownerId])).rows[0];
      return row ? { id: row.id, savedAt: iso(row.savedAt) } : null;
    },
    async listSavedPlans(ownerId, page, limit) {
      // One statement keeps rows and count consistent, including empty pages.
      const row = (await db.query<{ total: number; items: { id: string; title: string | null; constraints: ReadyPlan["constraints"]; savedAt: string }[] }>(`
        WITH owned AS (SELECT id,title,snapshot->'constraints' AS constraints,"savedAt" FROM "SavedPlan" WHERE "ownerId"=$1 AND "savedAt" IS NOT NULL),
        items AS (SELECT * FROM owned ORDER BY "savedAt" DESC,id LIMIT $2 OFFSET $3)
        SELECT (SELECT count(*)::int FROM owned) AS total,
          COALESCE((SELECT jsonb_agg(to_jsonb(items) ORDER BY "savedAt" DESC,id) FROM items),'[]'::jsonb) AS items`, [ownerId, limit, (page - 1) * limit])).rows[0];
      return { data: row.items.map(({ id, title, constraints: c, savedAt }) => ({ id, title: title ?? `${c.destination} · ${c.days} ngày`, destination: c.destination, days: c.days, people: c.people, startDate: c.startDate, budgetVnd: c.budgetVnd, savedAt: iso(savedAt) })), pagination: { page, limit, total: row.total, totalPages: Math.ceil(row.total / limit) } };
    },
    async getSavedPlan(ownerId, id) {
      const row = (await db.query<{ id: string; title: string | null; notes: string; revision: number; updatedAt: Date | string; snapshot: ReadyPlan; createdAt: Date | string; savedAt: Date | string }>('SELECT id,title,notes,revision,snapshot,"createdAt","savedAt","updatedAt" FROM "SavedPlan" WHERE id=$1 AND "ownerId"=$2 AND "savedAt" IS NOT NULL', [id, ownerId])).rows[0];
      return row ? { id: row.id, title: row.title ?? `${row.snapshot.constraints.destination} · ${row.snapshot.constraints.days} ngày`, notes: row.notes, revision: row.revision, updatedAt: iso(row.updatedAt), plan: row.snapshot, createdAt: iso(row.createdAt), savedAt: iso(row.savedAt) } : null;
    },
    async editSavedPlan(ownerId, id, edit) {
      const current = await this.getSavedPlan(ownerId, id);
      if (!current) throw new TripEditError(404, "trip_not_found");
      if (current.revision !== edit.revision) throw new TripEditError(409, "stale_trip_revision");
      const updatedAt = new Date().toISOString();
      const plan = applyTripEdit(current.plan, edit, updatedAt);
      const result = await db.query('UPDATE "SavedPlan" SET title=$3,notes=$4,snapshot=$5::jsonb,revision=revision+1,"updatedAt"=$6 WHERE id=$1 AND "ownerId"=$2 AND revision=$7 AND "savedAt" IS NOT NULL RETURNING id', [id, ownerId, edit.title, edit.notes, JSON.stringify(plan), updatedAt, edit.revision]);
      if (!result.rows.length) throw new TripEditError(409, "stale_trip_revision");
      return { ...current, title: edit.title, notes: edit.notes, revision: edit.revision + 1, updatedAt, plan };
    },
    async deleteSavedPlan(ownerId, id) {
      return (await db.query('DELETE FROM "SavedPlan" WHERE id=$1 AND "ownerId"=$2 AND "savedAt" IS NOT NULL RETURNING id', [id, ownerId])).rows.length > 0;
    },
  };
}
