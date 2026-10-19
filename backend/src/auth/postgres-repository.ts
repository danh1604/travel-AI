import { getDatabase } from "../config/database.js";
import { createSavedPlanRepository } from "../trips/repository.js";
import { createKnowledgeRepository } from "../rag/store.js";
import { createReviewRepository } from "../reviews/repository.js";
import {
  createAccountAdminRepository,
  type AccountSql,
} from "./account-admin.js";
import type { Prisma } from "../generated/prisma/client.js";
import { DuplicateEmail, publicUser, type AuthRepository } from "./types.js";

function connection(
  db: Pick<Prisma.TransactionClient, "$queryRawUnsafe">,
): AccountSql {
  return {
    query: async <T>(sql: string, values: unknown[]) => ({
      rows: await db.$queryRawUnsafe<T[]>(sql, ...values),
    }),
  };
}

export function postgresAuthRepository(): AuthRepository {
  return {
    ...createReviewRepository({ query: <T>(sql: string, values: unknown[]) => connection(getDatabase()).query<T>(sql, values) }),
    ...createKnowledgeRepository({ query: <T>(sql: string, values: unknown[]) => connection(getDatabase()).query<T>(sql, values), transaction: (run) => getDatabase().$transaction((tx) => run(connection(tx))) }),
    ...createSavedPlanRepository({ query: <T>(sql: string, values: unknown[]) => connection(getDatabase()).query<T>(sql, values) }),
    ...createAccountAdminRepository({
      query: <T>(sql: string, values: unknown[]) =>
        connection(getDatabase()).query<T>(sql, values),
      transaction: (run) =>
        getDatabase().$transaction((tx) => run(connection(tx))),
    }),
    findByEmail: (email) => getDatabase().user.findUnique({ where: { email } }),
    async register(user, session) {
      try {
        await getDatabase().$transaction(async (tx) => {
          await tx.user.create({ data: { ...user, role: "USER" } });
          await tx.authSession.create({ data: session });
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        )
          throw new DuplicateEmail();
        throw error;
      }
    },
    async createSession(session, previousHash) {
      await getDatabase().$transaction(async (tx) => {
        if (previousHash)
          await tx.authSession.deleteMany({
            where: { tokenHash: previousHash },
          });
        await tx.authSession.deleteMany({
          where: { userId: session.userId, expiresAt: { lte: new Date() } },
        });
        await tx.authSession.create({ data: session });
      });
    },
    async findSession(tokenHash, now) {
      const session = await getDatabase().authSession.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      return session && session.expiresAt > now
        ? publicUser(session.user)
        : null;
    },
    async deleteSession(tokenHash) {
      await getDatabase().authSession.deleteMany({ where: { tokenHash } });
    },
    async promoteAdmin(email) {
      const rows = await getDatabase().$queryRawUnsafe<{ id: string }[]>(
        `UPDATE "User" SET "roleRevision"="roleRevision"+CASE WHEN role='ADMIN' THEN 0 ELSE 1 END,role='ADMIN',"updatedAt"=now() WHERE email=$1 AND "passwordHash" IS NOT NULL RETURNING id`,
        email,
      );
      return rows.length > 0;
    },
    countUsers: () => getDatabase().user.count(),
    async close() {},
  };
}
