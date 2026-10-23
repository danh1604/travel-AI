import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { acquireLocalAuthLock } from "./local-lock.js";
import { createAccountAdminRepository } from "./account-admin.js";
import { createSavedPlanRepository } from "../trips/repository.js";
import { createKnowledgeRepository } from "../rag/store.js";
import { createReviewRepository } from "../reviews/repository.js";
import { createTravelRepository } from "../travel/repository.js";
import type { PGlite } from "@electric-sql/pglite";
import { DuplicateEmail, type AuthRepository, type AuthUser, type PublicUser } from "./types.js";

export async function createLocalAuthRepository(directory?: string): Promise<AuthRepository> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const releaseLock = await acquireLocalAuthLock(directory);
  let database: PGlite;
  try { database = new PGlite({ dataDir: directory, extensions: { vector } }); }
  catch (error) { await releaseLock(); throw error; }
  const travel = createTravelRepository({ query: <T>(sql: string, values: unknown[]) => database.query<T>(sql, values) });
  try { await migrate(database); await travel.seedTravelDemo({ onlyIfEmpty: true }); } catch (error) { await database.close(); await releaseLock(); throw error; }
  return {
    ...createReviewRepository({ query: <T>(sql: string, values: unknown[]) => database.query<T>(sql, values) }),
    ...travel,
    ...createKnowledgeRepository({ query: <T>(sql: string, values: unknown[]) => database.query<T>(sql, values), transaction: (run) => database.transaction((tx) => run({ query: <T>(sql: string, values: unknown[]) => tx.query<T>(sql, values) })) }),
    ...createSavedPlanRepository({ query: <T>(sql: string, values: unknown[]) => database.query<T>(sql, values) }),
    ...createAccountAdminRepository({
      query: <T>(sql: string, values: unknown[]) => database.query<T>(sql, values),
      transaction: (run) => database.transaction((tx) => run({ query: <T>(sql: string, values: unknown[]) => tx.query<T>(sql, values) })),
    }),
    async findByEmail(email) { return (await database.query<AuthUser>('SELECT id, email, name, role, "passwordHash" FROM "User" WHERE email=$1', [email])).rows[0] ?? null; },
    async register(user, session) {
      try {
        await database.transaction(async (tx) => {
          await tx.query('INSERT INTO "User" (id,email,name,role,"passwordHash","updatedAt") VALUES ($1,$2,$3,\'USER\',$4,now())', [user.id, user.email, user.name, user.passwordHash]);
          await tx.query('INSERT INTO "AuthSession" (id,"userId","tokenHash","expiresAt") VALUES ($1,$2,$3,$4)', [session.id, session.userId, session.tokenHash, session.expiresAt.toISOString()]);
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new DuplicateEmail();
        throw error;
      }
    },
    async createSession(session, previousHash) {
      await database.transaction(async (tx) => {
        if (previousHash) await tx.query('DELETE FROM "AuthSession" WHERE "tokenHash"=$1', [previousHash]);
        await tx.query('DELETE FROM "AuthSession" WHERE "userId"=$1 AND "expiresAt"<=now()', [session.userId]);
        await tx.query('INSERT INTO "AuthSession" (id,"userId","tokenHash","expiresAt") VALUES ($1,$2,$3,$4)', [session.id, session.userId, session.tokenHash, session.expiresAt.toISOString()]);
      });
    },
    async findSession(tokenHash, now) {
      return (await database.query<PublicUser>('SELECT u.id,u.email,u.name,u.role FROM "AuthSession" s JOIN "User" u ON u.id=s."userId" WHERE s."tokenHash"=$1 AND s."expiresAt">$2', [tokenHash, now.toISOString()])).rows[0] ?? null;
    },
    async deleteSession(tokenHash) { await database.query('DELETE FROM "AuthSession" WHERE "tokenHash"=$1', [tokenHash]); },
    async promoteAdmin(email) { return (await database.query('UPDATE "User" SET "roleRevision"="roleRevision"+CASE WHEN role=\'ADMIN\' THEN 0 ELSE 1 END,role=\'ADMIN\',"updatedAt"=now() WHERE email=$1 AND "passwordHash" IS NOT NULL RETURNING id', [email])).rows.length > 0; },
    async countUsers() { return (await database.query<{ count: number }>('SELECT count(*)::int AS count FROM "User"')).rows[0].count; },
    async close() { await database.close(); await releaseLock(); },
  };
}

async function migrate(database: PGlite) {
  await database.exec('CREATE TABLE IF NOT EXISTS "_LocalAuthMigration" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
  const root = new URL("../../prisma/migrations/", import.meta.url);
  const entries = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const sql = await readFile(new URL(`${entry.name}/migration.sql`, root), "utf8");
    const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
    const previous = (await database.query<{ checksum: string }>('SELECT checksum FROM "_LocalAuthMigration" WHERE name=$1', [entry.name])).rows[0];
    if (previous) {
      if (previous.checksum !== checksum) throw new Error("An applied local auth migration changed. Restore its original SQL before restarting.");
      continue;
    }
    await database.transaction(async (tx) => { await tx.exec(sql); await tx.query('INSERT INTO "_LocalAuthMigration" VALUES ($1,$2)', [entry.name, checksum]); });
  }
}
