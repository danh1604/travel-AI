import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createAccountAdminRepository } from "../src/auth/account-admin.js";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { createAccountAdminRouter } from "../src/auth/account-admin-router.js";
import { sessionCookieName, tokenDigest } from "../src/auth/router.js";
import { env } from "../src/config/env.js";

const query = { q: "", role: "" as const, page: 1, limit: 20 };

test("account SQL supports search/pagination, role changes, audit and last-Admin protection", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    const root = new URL("../prisma/migrations/", import.meta.url);
    for (const entry of (await readdir(root, { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name)))
      await db.exec(
        await readFile(new URL(`${entry.name}/migration.sql`, root), "utf8"),
      );
    const repo = createAccountAdminRepository({
      query: <T>(sql: string, values: unknown[]) => db.query<T>(sql, values),
      transaction: (run) =>
        db.transaction((tx) =>
          run({
            query: <T>(sql: string, values: unknown[]) =>
              tx.query<T>(sql, values),
          }),
        ),
    });
    const admin = randomUUID(),
      user = randomUUID(),
      other = randomUUID(),
      noLogin = randomUUID();
    for (const [id, email, name, role, hash] of [
      [admin, "owner@example.test", "Quản trị", "ADMIN", "test-secret-hash"],
      [
        user,
        "travel@example.test",
        "Đà Nẵng Tester",
        "USER",
        "test-secret-hash",
      ],
      [other, "sale@example.test", "Giảm 100%", "USER", "test-secret-hash"],
      [noLogin, "imported@example.test", "Nhập cũ", "USER", null],
    ]) {
      await db.query(
        `INSERT INTO "User" (id,email,name,role,"passwordHash","updatedAt") VALUES ($1,$2,$3,$4::"UserRole",$5,now())`,
        [id, email, name, role, hash],
      );
    }
    await db.query(
      `INSERT INTO "AuthSession" (id,"userId","tokenHash","createdAt","expiresAt") VALUES ($1,$2,$3,now()-interval '2 hours',now()+interval '1 hour'),($4,$2,$5,now()-interval '2 hours',now()-interval '1 hour')`,
      [randomUUID(), user, "a".repeat(64), randomUUID(), "b".repeat(64)],
    );
    const initial = await repo.listAccounts(query);
    assert.equal(initial.stats.users, 4);
    assert.equal(initial.stats.admins, 1);
    assert.equal(initial.stats.loginAdmins, 1);
    assert.equal(
      initial.data.find((item) => item.id === user)?.activeSessions,
      1,
    );
    assert.equal(
      initial.data.find((item) => item.id === noLogin)?.canLogin,
      false,
    );
    assert.ok(!JSON.stringify(initial).includes("test-secret-hash"));
    assert.ok(!JSON.stringify(initial).includes("passwordHash"));
    assert.ok(!JSON.stringify(initial).includes("tokenHash"));
    assert.equal(
      (await repo.listAccounts({ ...query, q: "ĐÀ NẴNG" })).pagination.total,
      1,
    );
    assert.equal(
      (await repo.listAccounts({ ...query, q: "%" })).pagination.total,
      1,
    );
    assert.equal(
      (await repo.listAccounts({ ...query, q: "' OR 1=1 --" })).pagination
        .total,
      0,
    );
    assert.equal(
      (await repo.listAccounts({ ...query, role: "ADMIN" })).pagination.total,
      1,
    );
    const first = await repo.listAccounts({ ...query, limit: 2 }),
      second = await repo.listAccounts({ ...query, limit: 2, page: 2 });
    assert.equal(
      new Set([...first.data, ...second.data].map((item) => item.id)).size,
      4,
    );
    await assert.rejects(repo.changeAccountRole(admin, admin, "USER", 1), {
      status: 409,
      code: "last_admin",
    });
    await assert.rejects(repo.changeAccountRole(user, other, "ADMIN", 1), {
      status: 403,
    });
    await assert.rejects(repo.changeAccountRole(admin, noLogin, "ADMIN", 1), {
      status: 409,
      code: "login_unavailable",
    });
    await assert.rejects(
      repo.changeAccountRole(admin, randomUUID(), "ADMIN", 1),
      { status: 404 },
    );
    await assert.rejects(repo.changeAccountRole(admin, user, "ADMIN", 99), {
      status: 409,
      code: "stale_account",
    });
    const promoted = await repo.changeAccountRole(admin, user, "ADMIN", 1);
    assert.equal(promoted.role, "ADMIN");
    assert.equal(promoted.roleRevision, 2);
    assert.equal(
      (await repo.changeAccountRole(admin, user, "ADMIN", 2)).roleRevision,
      2,
    );
    let audit = (
      await db.query<{
        actorId: string;
        targetId: string;
        beforeRole: string;
        afterRole: string;
      }>(
        'SELECT "actorId","targetId","beforeRole","afterRole" FROM "AccountRoleChange"',
      )
    ).rows;
    assert.deepEqual(audit, [
      {
        actorId: admin,
        targetId: user,
        beforeRole: "USER",
        afterRole: "ADMIN",
      },
    ]);
    const outcomes = await Promise.allSettled([
      repo.changeAccountRole(admin, admin, "USER", 1),
      repo.changeAccountRole(user, user, "USER", 2),
    ]);
    assert.equal(
      outcomes.filter((item) => item.status === "fulfilled").length,
      1,
    );
    const failed = outcomes.find((item) => item.status === "rejected");
    assert.ok(failed && failed.status === "rejected");
    assert.equal(failed.reason.code, "last_admin");
    assert.equal((await repo.listAccounts(query)).stats.loginAdmins, 1);
    audit = (await db.query('SELECT * FROM "AccountRoleChange"'))
      .rows as typeof audit;
    assert.equal(audit.length, 2);
    const demotedActor =
      (await repo.listAccounts(query)).data.find((item) => item.id === admin)!
        .role === "USER"
        ? admin
        : user;
    await assert.rejects(
      repo.changeAccountRole(demotedActor, other, "ADMIN", 1),
      { status: 403, code: "admin_required" },
    );
  } finally {
    await db.close();
  }
});

test("account API enforces session, role, Origin, strict inputs and immediate permission changes", async () => {
  const repo = await createLocalAuthRepository();
  const ownerId = randomUUID(),
    userId = randomUUID(),
    ownerToken = "d".repeat(64),
    userToken = "e".repeat(64);
  for (const [id, email, token] of [
    [ownerId, "owner@example.test", ownerToken],
    [userId, "user@example.test", userToken],
  ]) {
    await repo.register(
      { id, name: "Test", email, role: "USER", passwordHash: "test-only" },
      {
        id: randomUUID(),
        userId: id,
        tokenHash: tokenDigest(token),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );
  }
  await repo.promoteAdmin("owner@example.test");
  const ownerCookie = `${sessionCookieName}=${ownerToken}`,
    userCookie = `${sessionCookieName}=${userToken}`,
    origin = new URL(env.CLIENT_ORIGIN).origin;
  const app = express();
  app.use(express.json());
  app.use(
    "/users",
    createAccountAdminRouter(async () => repo),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/users`;
  const change = (
    id: string,
    body: unknown,
    cookie = ownerCookie,
    source: string | null = origin,
  ) =>
    fetch(`${base}/${id}/role`, {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        ...(source ? { Origin: source } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal(
      (await fetch(base, { headers: { Cookie: userCookie } })).status,
      403,
    );
    assert.equal(
      (await change(userId, { role: "ADMIN", revision: 1 }, userCookie)).status,
      403,
    );
    const response = await fetch(base, { headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const list = await response.json();
    assert.equal(list.currentUserId, ownerId);
    assert.equal(list.data.length, 2);
    assert.ok(!JSON.stringify(list).includes("passwordHash"));
    for (const search of [
      "?page=0",
      "?limit=100",
      "?role=ROOT",
      "?q[]=x",
      "?unexpected=true",
    ])
      assert.equal(
        (await fetch(`${base}${search}`, { headers: { Cookie: ownerCookie } }))
          .status,
        400,
      );
    assert.equal(
      (await change(userId, { role: "ADMIN", revision: 1 }, ownerCookie, null))
        .status,
      403,
    );
    assert.equal(
      (
        await change(
          userId,
          { role: "ADMIN", revision: 1 },
          ownerCookie,
          "https://untrusted.test",
        )
      ).status,
      403,
    );
    for (const body of [
      { role: "ROOT", revision: 1 },
      { role: "ADMIN" },
      { role: "ADMIN", revision: 1, actorId: ownerId },
      { role: "ADMIN", revision: 1, passwordHash: "x" },
      { role: "ADMIN", revision: 1, name: "Injected" },
    ])
      assert.equal((await change(userId, body)).status, 400);
    assert.equal(
      (await change("invalid-id", { role: "ADMIN", revision: 1 })).status,
      400,
    );
    assert.equal(
      (await change(randomUUID(), { role: "ADMIN", revision: 1 })).status,
      404,
    );
    const owner = (await repo.listAccounts(query)).data.find(
      (item) => item.id === ownerId,
    )!;
    assert.equal(
      (await change(ownerId, { role: "USER", revision: owner.roleRevision }))
        .status,
      409,
    );
    const promoted = await change(userId, { role: "ADMIN", revision: 1 });
    assert.equal(promoted.status, 200);
    assert.equal((await promoted.json()).data.roleRevision, 2);
    assert.equal(
      (await fetch(base, { headers: { Cookie: userCookie } })).status,
      200,
    );
    assert.equal(
      (await change(userId, { role: "USER", revision: 1 })).status,
      409,
    );
    assert.equal(
      (await change(userId, { role: "USER", revision: 2 })).status,
      200,
    );
    assert.equal(
      (await fetch(base, { headers: { Cookie: userCookie } })).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/${userId}/role`, {
          method: "PATCH",
          headers: {
            Cookie: ownerCookie,
            Origin: origin,
            "Content-Type": "text/plain",
          },
          body: "test",
        })
      ).status,
      415,
    );
    await repo.deleteSession(tokenDigest(ownerToken));
    assert.equal(
      (await fetch(base, { headers: { Cookie: ownerCookie } })).status,
      401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await repo.close();
  }
});
