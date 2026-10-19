import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import express from "express";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { sessionCookieName, tokenDigest } from "../src/auth/router.js";
import { createTripsRouter } from "../src/trips/router.js";
import { createPlannerRouter } from "../src/planner/router.js";
import { env } from "../src/config/env.js";
import type { ReadyPlan } from "../src/trips/repository.js";
import { applyTripEdit, tripEdit, TripEditError } from "../src/trips/edit.js";

const sourceId = randomUUID();
const plan: ReadyPlan = {
  status: "ready", generatedAt: "2030-01-01T00:00:00Z",
  constraints: { destination: "Đà Nẵng", days: 1, people: 2, budgetVnd: 12000000, startDate: null, style: "relaxed" },
  days: [{ dayNumber: 1, date: null, activities: [{ ref: "t0d0s0", period: "morning", title: "Biển Mỹ Khê", content: "Nội dung nguồn", placeName: null, costVnd: null, source: { tourId: sourceId, tourName: "Tour nguồn", dayNumber: 1, needsReview: true } }] }],
  weather: { status: "outside_forecast", days: [] }, budget: { totalBudgetVnd: "12000000", itineraryTotalVnd: null, complete: false },
  packageQuotes: [], warnings: ["Giá chưa đầy đủ"], evidence: { ai: "responded", model: "test-only", tools: ["search_tours", "build_itinerary"], catalogSource: "snapshot" },
};

test("saved trips persist, are idempotent, and are isolated per authenticated account", async (t) => {
  const baseDirectory = resolve("../.cache/tmp");
  const directory = await mkdtemp(join(baseDirectory, "saved-trips-"));
  let repository = await createLocalAuthRepository(directory);
  const owner = randomUUID(), other = randomUUID();
  for (const [id, token] of [[owner, "a"], [other, "b"]]) {
    await repository.register({ id, email: `${id}@example.test`, name: "Test traveler", passwordHash: "test-only", role: "USER" }, { id: randomUUID(), userId: id, tokenHash: tokenDigest(token.repeat(64)), expiresAt: new Date(Date.now() + 3600_000) });
  }
  const app = express(); app.use(express.json());
  app.use("/trips", createTripsRouter(async () => repository));
  let calls = 0;
  app.use("/planner", createPlannerRouter(async () => { calls++; return structuredClone(plan); }, async () => repository));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((r) => server.once("listening", r));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const headers = (token = "a") => ({ Cookie: `${sessionCookieName}=${token.repeat(64)}`, Origin: new URL(env.CLIENT_ORIGIN).origin, "Content-Type": "application/json" });
  const post = (body: unknown, token = "a", extra = {}) => fetch(`${base}/trips`, { method: "POST", headers: { ...headers(token), ...extra }, body: JSON.stringify(body) });
  const get = (path: string, token = "a") => fetch(`${base}/trips${path}`, { headers: headers(token) });
  let draftId = "";
  try {
    await t.test("generation creates a private draft which is not listed until Save", async () => {
      const generated = await fetch(`${base}/planner/generate`, { method: "POST", headers: headers(), body: JSON.stringify({ prompt: "Đi Đà Nẵng một ngày" }) });
      assert.equal(generated.status, 200);
      const body = await generated.json(); draftId = body.data.draftId;
      assert.match(draftId, /^[\da-f-]{36}$/); assert.equal(calls, 1);
      assert.equal((await (await get("")).json()).pagination.total, 0);
      assert.equal((await get(`/${draftId}`)).status, 404);
    });
    await t.test("rejects anonymous, foreign-owner, CSRF and client-supplied snapshots", async () => {
      assert.equal((await fetch(`${base}/trips`)).status, 401);
      assert.equal((await post({ draftId }, "b")).status, 404);
      assert.equal((await post({ draftId, ownerId: other })).status, 400);
      assert.equal((await post({ draftId, snapshot: plan })).status, 400);
      assert.equal((await post({ draftId }, "a", { Origin: "https://attacker.test" })).status, 403);
      assert.equal((await post({ draftId }, "a", { "Content-Type": "text/plain" })).status, 415);
      assert.equal((await get("?limit=1000")).status, 400);
      assert.equal((await get("/invalid-id")).status, 400);
    });
    await t.test("Save is idempotent and list exposes only the owner's summary", async () => {
      const saved = await post({ draftId }); assert.equal(saved.status, 200);
      const first = await saved.json();
      assert.deepEqual(await (await post({ draftId })).json(), first);
      const list = await (await get("")).json();
      assert.equal(list.pagination.total, 1); assert.equal(list.data[0].id, draftId);
      assert.equal(list.data[0].startDate, null); assert.equal(list.data[0].budgetVnd, 12000000);
      assert.equal("ownerId" in list.data[0], false); assert.equal("snapshot" in list.data[0], false);
      assert.equal((await (await get("?page=2&limit=1")).json()).data.length, 0);
      assert.equal((await (await get("", "b")).json()).pagination.total, 0);
      assert.equal((await get(`/${draftId}`, "b")).status, 404);
    });
    await t.test("saved snapshot survives database restart and does not call AI again", async () => {
      await repository.close(); repository = await createLocalAuthRepository(directory);
      const detail = await get(`/${draftId}`); assert.equal(detail.status, 200);
      assert.equal(detail.headers.get("cache-control"), "no-store");
      const body = await detail.json(); assert.deepEqual(body.data.plan, plan);
      assert.equal(calls, 1);
      await repository.promoteAdmin(`${other}@example.test`);
      assert.equal((await get(`/${draftId}`, "b")).status, 404);
    });
    await t.test("editing preserves sources, protects ownership and rejects concurrent stale writes", async () => {
      const edit = { revision: 1, title: "Chuyến đi của gia đình", notes: "Mang áo khoác", startDate: "2030-02-28", days: [{ dayNumber: 1, note: "Đi thong thả", activities: [{ ref: "t0d0s0", period: "afternoon", note: "Mang máy ảnh" }] }] };
      const patch = (body: unknown, token = "a", extra = {}) => fetch(`${base}/trips/${draftId}`, { method: "PATCH", headers: { ...headers(token), ...extra }, body: JSON.stringify(body) });
      assert.equal((await patch(edit, "b")).status, 404);
      assert.equal((await patch(edit, "a", { Origin: "https://attacker.test" })).status, 403);
      assert.equal((await patch({ ...edit, ownerId: other })).status, 400);
      assert.equal((await patch({ ...edit, startDate: "2030-02-30" })).status, 400);
      const response = await patch(edit); assert.equal(response.status, 200);
      const saved = (await response.json()).data;
      assert.equal(saved.title, edit.title); assert.equal(saved.notes, edit.notes); assert.equal(saved.revision, 2);
      assert.equal(saved.plan.days[0].date, "2030-02-28"); assert.equal(saved.plan.days[0].note, "Đi thong thả");
      assert.equal(saved.plan.days[0].activities[0].note, "Mang máy ảnh");
      assert.deepEqual(saved.plan.days[0].activities[0].source, plan.days[0].activities[0].source);
      assert.equal(saved.plan.days[0].activities[0].content, plan.days[0].activities[0].content);
      assert.equal((await patch(edit)).status, 409);
      assert.equal((await (await get("")).json()).data[0].title, edit.title);
      await repository.close(); repository = await createLocalAuthRepository(directory);
      assert.deepEqual((await (await get(`/${draftId}`)).json()).data, saved);
      assert.equal(calls, 1);
    });
    await t.test("deletion requires owner and cannot delete another account's plan", async () => {
      const remove = (token: string, extra = {}) => fetch(`${base}/trips/${draftId}`, { method: "DELETE", headers: { ...headers(token), ...extra }, body: "{}" });
      assert.equal((await remove("b")).status, 404);
      assert.equal((await remove("a", { Origin: "https://attacker.test" })).status, 403);
      assert.equal((await get(`/${draftId}`)).status, 200);
      assert.equal((await remove("a")).status, 204);
      assert.equal((await get(`/${draftId}`)).status, 404);
      assert.equal((await post({ draftId })).status, 404);
      assert.equal((await (await get("")).json()).pagination.total, 0);
      await repository.deleteSession(tokenDigest("a".repeat(64)));
      assert.equal((await get("")).status, 401);
    });
  } finally {
    await new Promise<void>((r) => server.close(() => r())); await repository.close();
    const target = resolve(directory);
    assert.ok(target.startsWith(baseDirectory + sep));
    await rm(target, { recursive: true, force: true });
  }
});

test("manual edit moves and removes only existing activities and handles date boundaries", () => {
  const original = structuredClone(plan);
  original.constraints.days = 2;
  original.days.push({ dayNumber: 2, date: null, activities: [{ ...structuredClone(original.days[0].activities[0]), ref: "second", title: "Điểm thứ hai" }] });
  const edit = tripEdit.parse({ revision: 1, title: "Tên mới", notes: "", startDate: "2030-02-28", days: [{ dayNumber: 1, note: "", activities: [{ ref: "second", period: "morning", note: "" }] }, { dayNumber: 2, note: "", activities: [{ ref: "t0d0s0", period: "afternoon", note: "" }] }] });
  const updated = applyTripEdit(original, edit, "2030-01-01T00:00:00Z");
  assert.equal(updated.days[1].date, "2030-03-01");
  assert.equal(updated.days[0].activities[0].title, "Điểm thứ hai");
  assert.equal(updated.days[0].activities[0].costVnd, null);
  assert.equal(updated.weather.status, "outside_forecast"); assert.deepEqual(updated.packageQuotes, []);
  const missing = structuredClone(edit); missing.days[0].activities[0].ref = "invented";
  assert.throws(() => applyTripEdit(original, missing, "x"), TripEditError);
  const duplicate = structuredClone(edit); duplicate.days[1].activities[0].ref = "second";
  assert.throws(() => applyTripEdit(original, duplicate, "x"), TripEditError);
  const removed = structuredClone(edit); removed.days[1].activities = [];
  assert.equal(applyTripEdit(original, removed, "x").days[1].activities.length, 0);
  removed.days[0].activities = [];
  assert.throws(() => applyTripEdit(original, removed, "x"), TripEditError);
  assert.equal(tripEdit.safeParse({ ...edit, snapshot: original }).success, false);
});
