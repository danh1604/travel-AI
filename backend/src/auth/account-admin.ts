import { randomUUID } from "node:crypto";
import type { PublicUser, Role } from "./types.js";

export type AccountQuery = {
  q: string;
  role: Role | "";
  page: number;
  limit: number;
};
export type ManagedAccount = PublicUser & {
  createdAt: string;
  updatedAt: string;
  roleRevision: number;
  canLogin: boolean;
  activeSessions: number;
};
export type AccountList = {
  data: ManagedAccount[];
  stats: { users: number; admins: number; loginAdmins: number };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
export interface AccountAdminRepository {
  listAccounts(query: AccountQuery): Promise<AccountList>;
  changeAccountRole(
    actorId: string,
    userId: string,
    role: Role,
    revision: number,
  ): Promise<ManagedAccount>;
}
export class AccountAdminError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export interface AccountSql {
  query<T>(sql: string, values: unknown[]): Promise<{ rows: T[] }>;
}
export interface AccountDatabase extends AccountSql {
  transaction<T>(operation: (tx: AccountSql) => Promise<T>): Promise<T>;
}
type Row = Omit<ManagedAccount, "createdAt" | "updatedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
};
const columns = `u.id,u.email,u.name,u.role,u."createdAt",u."updatedAt",u."roleRevision",
  (u."passwordHash" IS NOT NULL) AS "canLogin",
  (SELECT count(*)::int FROM "AuthSession" s WHERE s."userId"=u.id AND s."expiresAt">now()) AS "activeSessions"`;
function project(row: Row): ManagedAccount {
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}
export function createAccountAdminRepository(
  database: AccountDatabase,
): AccountAdminRepository {
  return {
    listAccounts: (query) =>
      database.transaction(async (tx) => {
        const values = [query.q, query.role];
        const where = `($1='' OR position(lower($1) in lower(u.name || ' ' || u.email))>0) AND ($2='' OR u.role::text=$2)`;
        const stats = (
          await tx.query<{
            users: number;
            admins: number;
            loginAdmins: number;
          }>(
            `SELECT count(*)::int AS users,
        count(*) FILTER (WHERE role='ADMIN')::int AS admins,
        count(*) FILTER (WHERE role='ADMIN' AND "passwordHash" IS NOT NULL)::int AS "loginAdmins" FROM "User"`,
            [],
          )
        ).rows[0];
        const total = (
          await tx.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM "User" u WHERE ${where}`,
            values,
          )
        ).rows[0].count;
        const data = (
          await tx.query<Row>(
            `SELECT ${columns} FROM "User" u WHERE ${where} ORDER BY u."createdAt" DESC,u.id ASC LIMIT $3 OFFSET $4`,
            [...values, query.limit, (query.page - 1) * query.limit],
          )
        ).rows.map(project);
        return {
          data,
          stats,
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
          },
        };
      }),
    changeAccountRole: (actorId, userId, role, revision) =>
      database.transaction(async (tx) => {
        // Serialize role changes, including simultaneous self-demotions. Every
        // transaction locks the same current Admin rows in a deterministic order.
        await tx.query(
          `SELECT id FROM "User" WHERE role='ADMIN' ORDER BY id FOR UPDATE`,
          [],
        );
        const actor = (
          await tx.query<{ role: Role }>(
            'SELECT role FROM "User" WHERE id=$1',
            [actorId],
          )
        ).rows[0];
        if (actor?.role !== "ADMIN")
          throw new AccountAdminError(403, "admin_required");
        const target = (
          await tx.query<Row>(
            `SELECT ${columns} FROM "User" u WHERE u.id=$1 FOR UPDATE OF u`,
            [userId],
          )
        ).rows[0];
        if (!target) throw new AccountAdminError(404, "account_not_found");
        if (target.roleRevision !== revision)
          throw new AccountAdminError(409, "stale_account");
        if (target.role === role) return project(target);
        if (role === "ADMIN" && !target.canLogin)
          throw new AccountAdminError(409, "login_unavailable");
        if (target.role === "ADMIN" && role === "USER" && target.canLogin) {
          const admins = (
            await tx.query<{ count: number }>(
              `SELECT count(*)::int AS count FROM "User" WHERE role='ADMIN' AND "passwordHash" IS NOT NULL`,
              [],
            )
          ).rows[0].count;
          if (admins <= 1) throw new AccountAdminError(409, "last_admin");
        }
        await tx.query(
          `UPDATE "User" SET role=$2::"UserRole","roleRevision"="roleRevision"+1,"updatedAt"=now() WHERE id=$1`,
          [userId, role],
        );
        await tx.query(
          `INSERT INTO "AccountRoleChange" (id,"actorId","targetId","beforeRole","afterRole") VALUES ($1,$2,$3,$4::"UserRole",$5::"UserRole")`,
          [randomUUID(), actorId, userId, target.role, role],
        );
        return project(
          (
            await tx.query<Row>(
              `SELECT ${columns} FROM "User" u WHERE u.id=$1`,
              [userId],
            )
          ).rows[0],
        );
      }),
  };
}
