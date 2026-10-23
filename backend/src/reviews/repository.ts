import { randomUUID } from "node:crypto";
import type { AccountSql } from "../auth/account-admin.js";

export type Review = { id: string; tourId: string; rating: number; comment: string; authorName: string; hidden: boolean; revision: number; createdAt: string; updatedAt: string };
export class ReviewConflict extends Error {}
const fields = 'r.id,r."tourId",r.rating,r.comment,u.name AS "authorName",r.hidden,r.revision,r."createdAt",r."updatedAt"';
type Row = Omit<Review, "createdAt" | "updatedAt"> & { createdAt: Date | string; updatedAt: Date | string };
const serialize = (row: Row): Review => ({ ...row, createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString() });
export function createReviewRepository(db: AccountSql) {
  return {
    async listReviews(tourId: string, userId: string | null, page: number) {
      // One statement gives count, average and page from the same database snapshot.
      const result = (await db.query<{ total: number; average: number | null; data: Row[]; mine: Row | null }>(`
        SELECT (SELECT count(*)::int FROM "TourReview" WHERE "tourId"=$1 AND NOT hidden) AS total,
          (SELECT round(avg(rating),1)::float8 FROM "TourReview" WHERE "tourId"=$1 AND NOT hidden) AS average,
          COALESCE((SELECT json_agg(v) FROM (SELECT ${fields} FROM "TourReview" r JOIN "User" u ON u.id=r."userId" WHERE r."tourId"=$1 AND NOT r.hidden ORDER BY r."createdAt" DESC,r.id LIMIT 10 OFFSET $3) v),'[]'::json) AS data,
          (SELECT row_to_json(v) FROM (SELECT ${fields} FROM "TourReview" r JOIN "User" u ON u.id=r."userId" WHERE r."tourId"=$1 AND r."userId"=$2::uuid) v) AS mine`, [tourId, userId, (page - 1) * 10])).rows[0];
      return { data: result.data.map(serialize), mine: result.mine ? serialize(result.mine) : null, total: result.total, average: result.average, page, totalPages: Math.ceil(result.total / 10) };
    },
    async writeReview(tourId: string, userId: string, input: { rating: number; comment: string; revision: number }) {
      // Concurrent creation is safe; edits retain the moderator's hidden flag.
      const rows = await db.query<{ id: string }>(`INSERT INTO "TourReview" (id,"tourId","userId",rating,comment)
        SELECT $1,$2,$3,$4,$5 WHERE $6::int=0
        ON CONFLICT ("tourId","userId") DO NOTHING RETURNING id`, [randomUUID(), tourId, userId, input.rating, input.comment, input.revision]);
      if (rows.rows.length) return;
      if (input.revision > 0) {
        const edited = await db.query(`UPDATE "TourReview" SET rating=$3,comment=$4,revision=revision+1,"updatedAt"=now() WHERE "tourId"=$1 AND "userId"=$2 AND revision=$5 RETURNING id`, [tourId, userId, input.rating, input.comment, input.revision]);
        if (edited.rows.length) return;
      }
      throw new ReviewConflict();
    },
    async deleteReview(tourId: string, userId: string, revision: number) {
      const result = await db.query('DELETE FROM "TourReview" WHERE "tourId"=$1 AND "userId"=$2 AND revision=$3 RETURNING id', [tourId, userId, revision]);
      if (!result.rows.length) throw new ReviewConflict();
    },
    async adminReviews(page: number) {
      const result = (await db.query<{ total: number; data: Row[] }>(`SELECT (SELECT count(*)::int FROM "TourReview") AS total, COALESCE((SELECT json_agg(v) FROM (SELECT ${fields} FROM "TourReview" r JOIN "User" u ON u.id=r."userId" ORDER BY r."createdAt" DESC,r.id LIMIT 20 OFFSET $1) v),'[]'::json) AS data`, [(page - 1) * 20])).rows[0];
      return { data: result.data.map(serialize), total: result.total, page, totalPages: Math.ceil(result.total / 20) };
    },
    // Reviews have no foreign key to the catalogue; remove them with the tour they describe.
    async deleteTourReviews(tourId: string) {
      await db.query('DELETE FROM "TourReview" WHERE "tourId"=$1', [tourId]);
    },
    async moderateReview(id: string, hidden: boolean, revision: number) {
      const result = await db.query('UPDATE "TourReview" SET hidden=$2,revision=revision+1,"updatedAt"=now() WHERE id=$1 AND revision=$3 RETURNING id', [id, hidden, revision]);
      if (!result.rows.length) throw new ReviewConflict();
    },
  };
}
export type ReviewRepository = ReturnType<typeof createReviewRepository>;
