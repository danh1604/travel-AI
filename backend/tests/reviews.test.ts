import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { sessionCookieName, tokenDigest } from "../src/auth/router.js";
import { createReviewsRouter } from "../src/reviews/router.js";
import { snapshotSchema } from "../src/catalog/contracts.js";
import { env } from "../src/config/env.js";

test("tour review API persists one rating per owner and protects privacy, moderation and concurrent updates", async (t) => {
  const repo = await createLocalAuthRepository(), tourId = randomUUID(), categoryId = randomUUID();
  const catalog = snapshotSchema.parse({ version: 1, generatedAt: new Date().toISOString(), categories: [], tours: [{ id: tourId, slug: "tour", name: "Tour thử nghiệm", category: { id: categoryId, name: "Danh mục", slug: "category" }, departureLocation: "Hà Nội", durationDays: 3, coverImage: null, sourcePriceVnd: null, upcomingDepartures: 0, needsReview: true, days: [], images: [], sections: [], departures: [] }] });
  for (const token of ["a", "b", "c"]) { const id = randomUUID(); await repo.register({ id, email: `${token}@example.test`, name: `Người dùng ${token}`, passwordHash: "test-only", role: "USER" }, { id: randomUUID(), userId: id, tokenHash: tokenDigest(token.repeat(64)), expiresAt: new Date(Date.now() + 3600000) }); }
  await repo.promoteAdmin("c@example.test");
  const app = express(); app.use(express.json()); app.use(createReviewsRouter(async () => repo, async () => catalog));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`, path = `/tours/${tourId}`;
  const headers = (token?: string) => ({ Origin: new URL(env.CLIENT_ORIGIN).origin, "Content-Type": "application/json", ...(token ? { Cookie: `${sessionCookieName}=${token.repeat(64)}` } : {}) });
  const mutate = (method: string, url: string, data: unknown, token?: string, extra = {}) => fetch(base + url, { method, headers: { ...headers(token), ...extra }, body: JSON.stringify(data) });
  const get = async (token?: string) => { const response = await fetch(base + path, { headers: headers(token) }); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); return response.json(); };
  let mine: { id: string; revision: number };
  try {
    await t.test("anonymous reads and authorization, CSRF, body and catalog checks", async () => {
      assert.equal((await get()).average, null);
      assert.equal((await mutate("PUT", path + "/mine", { rating: 5, revision: 0 })).status, 401);
      assert.equal((await mutate("PUT", path + "/mine", { rating: 5, revision: 0 }, "a", { Origin: "https://attacker.test" })).status, 403);
      assert.equal((await mutate("PUT", path + "/mine", { rating: 5, revision: 0 }, "a", { "Content-Type": "text/plain" })).status, 415);
      for (const body of [{ rating: 6, revision: 0 }, { rating: 0, revision: 0 }, { rating: 1.5, revision: 0 }, { rating: 5, revision: 0, comment: "x".repeat(2001) }, { rating: 5, revision: 0, userId: randomUUID() }]) assert.equal((await mutate("PUT", path + "/mine", body, "a")).status, 400);
      assert.equal((await mutate("PUT", `/tours/${randomUUID()}/mine`, { rating: 5, revision: 0 }, "a")).status, 404);
      assert.equal((await fetch(base + "/admin")).status, 401);
      assert.equal((await fetch(base + "/admin", { headers: headers("a") })).status, 403);
    });
    await t.test("one review per account, optional text and visible-only average", async () => {
      assert.equal((await mutate("PUT", path + "/mine", { rating: 5, comment: "  Tour tốt, nên cân nhắc!  ", revision: 0 }, "a")).status, 204);
      mine = (await get("a")).mine;
      assert.equal((await mutate("PUT", path + "/mine", { rating: 1, revision: 0 }, "a")).status, 409);
      assert.equal((await mutate("PUT", path + "/mine", { rating: 1, revision: 0 }, "b")).status, 204);
      const publicList = await get(); assert.equal(publicList.total, 2); assert.equal(publicList.average, 3); assert.equal(publicList.mine, null);
      assert.ok(!JSON.stringify(publicList).includes("@example.test")); assert.ok(!JSON.stringify(publicList).includes("passwordHash"));
      assert.equal((await get("a")).mine.comment, "Tour tốt, nên cân nhắc!");
      assert.equal((await mutate("PUT", path + "/mine", { rating: 4, comment: "Đã sửa", revision: 1 }, "a")).status, 204);
      assert.equal((await get()).average, 2.5);
    });
    await t.test("hiding removes rating from public aggregate and edits cannot bypass moderation", async () => {
      const admin = await (await fetch(base + "/admin", { headers: headers("c") })).json(); assert.equal(admin.total, 2);
      mine = (await get("a")).mine;
      assert.equal((await mutate("PATCH", `/admin/${mine.id}`, { hidden: true, revision: mine.revision }, "b")).status, 403);
      assert.equal((await mutate("PATCH", `/admin/${mine.id}`, { hidden: true, revision: mine.revision }, "c")).status, 204);
      assert.equal((await get()).total, 1); assert.equal((await get()).average, 1);
      assert.equal((await mutate("PUT", path + "/mine", { rating: 5, comment: "Sửa bản cũ", revision: mine.revision }, "a")).status, 409);
      const hidden = (await get("a")).mine; assert.equal(hidden.hidden, true);
      assert.equal((await mutate("PUT", path + "/mine", { rating: 5, comment: "Nội dung mới", revision: hidden.revision }, "a")).status, 204);
      assert.equal((await get()).total, 1);
      const edited = (await get("a")).mine;
      assert.equal((await mutate("PATCH", `/admin/${mine.id}`, { hidden: false, revision: hidden.revision }, "c")).status, 409);
      assert.equal((await mutate("PATCH", `/admin/${mine.id}`, { hidden: false, revision: edited.revision }, "c")).status, 204);
      assert.equal((await get()).average, 3);
    });
    await t.test("delete is owner-scoped and refuses stale revisions", async () => {
      const a = (await get("a")).mine, b = (await get("b")).mine;
      assert.equal((await mutate("DELETE", path + "/mine", { revision: a.revision }, "b")).status, 409);
      assert.equal((await get("a")).mine.id, a.id);
      assert.equal((await mutate("DELETE", path + "/mine", { revision: b.revision }, "b")).status, 204);
      assert.equal((await mutate("DELETE", path + "/mine", { revision: a.revision }, "a")).status, 204);
      assert.equal((await get()).total, 0); assert.equal((await get()).average, null);
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); await repo.close(); }
});

test("reviews survive local database restart, and concurrent creation cannot duplicate a user's rating", async () => {
  const root = resolve(fileURLToPath(new URL("../../.cache/tmp/", import.meta.url)));
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "reviews-")), userId = randomUUID(), tourId = randomUUID();
  assert.ok(resolve(directory).startsWith(root + sep));
  let repo = await createLocalAuthRepository(directory);
  try {
    await repo.register({ id: userId, email: "restart@example.test", name: "Tên hiển thị", passwordHash: "test-only", role: "USER" }, { id: randomUUID(), userId, tokenHash: tokenDigest("d".repeat(64)), expiresAt: new Date(Date.now() + 3600000) });
    const writes = await Promise.allSettled([repo.writeReview(tourId, userId, { rating: 4, comment: "Lưu qua khởi động lại", revision: 0 }), repo.writeReview(tourId, userId, { rating: 4, comment: "Lưu qua khởi động lại", revision: 0 })]);
    assert.equal(writes.filter((result) => result.status === "fulfilled").length, 1);
    await repo.close(); repo = await createLocalAuthRepository(directory);
    const result = await repo.listReviews(tourId, userId, 1);
    assert.equal(result.total, 1); assert.equal(result.average, 4); assert.equal(result.mine?.comment, "Lưu qua khởi động lại");
  } finally { await repo.close(); if (!resolve(directory).startsWith(root + sep)) throw new Error("Unexpected test directory"); await rm(directory, { recursive: true, force: true }); }
});
