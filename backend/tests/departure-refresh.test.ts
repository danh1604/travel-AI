import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { planRefresh, refreshInput, vnToday, type RefreshTourInput } from "../src/catalog/departure-refresh.js";
import { createLocalAdminCatalog } from "../src/catalog/local-admin.js";
import { createAdminCatalogRouter } from "../src/catalog/admin-router.js";
import { snapshotSchema } from "../src/catalog/contracts.js";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { sessionCookieName, tokenDigest } from "../src/auth/router.js";
import { env } from "../src/config/env.js";

const now = Date.parse("2026-10-20T08:00:00Z"); // 15:00 in Vietnam
const input = (over = {}) => refreshInput.parse({ startDate: "2026-10-21", gapDays: 7, dryRun: true, ...over });
const dep = (startsAt: string, over = {}) => ({ id: randomUUID(), startsAt, endsAt: new Date(Date.parse(startsAt) + 2 * 86_400_000).toISOString(), status: "open", bookedPeople: null as number | null, ...over });
const tour = (departures: ReturnType<typeof dep>[], over = {}): RefreshTourInput => ({ id: randomUUID(), name: "Tour", status: "active", departures, ...over });

test("planner re-dates every stale departure into the future, in order, keeping time and length", () => {
  const old = [dep("2023-01-05T00:00:00Z"), dep("2023-03-01T00:00:00Z"), dep("2023-05-10T23:00:00Z")]; // 07:00, 07:00, 06:00 VN
  const result = planRefresh([tour(old)], input(), now);
  const [first, second, third] = result.tours[0].changes;
  assert.equal(result.tours[0].changes.length, 3, "the whole schedule is refreshed, not a capped number");
  assert.deepEqual([first.departureId, second.departureId, third.departureId], old.map((item) => item.id), "original order is kept");
  assert.equal(first.to, "2026-10-21T00:00:00.000Z", "07:00 VN on the 21st");
  assert.equal(Date.parse(first.endsAt) - Date.parse(first.to), 2 * 86_400_000);
  assert.equal(Date.parse(second.to) - Date.parse(first.to), 7 * 86_400_000, "gap in days, original time of day kept");
  assert.equal(Date.parse(third.to) - Date.parse(second.to), 7 * 86_400_000 - 3_600_000, "06:00 time of day kept");
  assert.ok(result.tours[0].changes.every((c) => Date.parse(c.to) > now));
});

test("planner skips fresh, hidden, empty and full-enough tours and protects history with guests", () => {
  const future = dep("2026-12-01T00:00:00Z");
  const fresh = tour([future, dep("2026-11-01T00:00:00Z")]);                // already has 2 upcoming
  const hidden = tour([dep("2022-01-01T00:00:00Z")], { status: "inactive" });
  const empty = tour([]);
  const guests = tour([dep("2022-01-01T00:00:00Z", { bookedPeople: 12 })]);
  const result = planRefresh([fresh, hidden, empty, guests], input(), now);
  assert.deepEqual(result.tours.map((t) => t.id), [guests.id]);
  assert.equal(result.tours[0].changes[0].action, "clone", "departures with guests are cloned, never rewritten");
  assert.deepEqual(result.summary, { tours: 1, moved: 0, cloned: 1 });
  assert.equal(planRefresh([hidden], input({ tourId: hidden.id }), now).summary.moved, 1, "an explicit tour id includes hidden tours");
  assert.equal(planRefresh([tour([future, dep("2022-01-01T00:00:00Z")])], input(), now).summary.moved, 1, "tours that already have a future date still get their old dates refreshed");
  const copied = dep("2022-01-01T00:00:00Z", { bookedPeople: 4, cloned: true });
  assert.equal(planRefresh([tour([copied])], input(), now).summary.tours, 0, "an original that already has a refresh copy is not copied again");
});

test("a start time that already passed today moves to the next day", () => {
  const morning = dep("2023-01-01T00:00:00Z"); // 07:00 VN, already gone at 15:00
  const today = planRefresh([tour([morning])], input({ startDate: vnToday(now) }), now).tours[0].changes[0];
  assert.equal(today.to, "2026-10-21T00:00:00.000Z");
});

test("input validation", () => {
  for (const bad of [{ gapDays: 0 }, { gapDays: 91 }, { perTour: 2 }, { startDate: "21/10/2026" }, { tourId: "x" }, { extra: 1 }, { dryRun: "yes" }])
    assert.equal(refreshInput.safeParse({ startDate: "2026-10-21", gapDays: 7, dryRun: true, ...bad }).success, false, JSON.stringify(bad));
});

test("local catalog previews without writing, applies once, and the endpoint enforces Admin and date rules", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "pwy-refresh-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const category = { id: randomUUID(), name: "Biển", slug: "bien" };
  const stale = { id: randomUUID(), startsAt: "2022-04-01T00:00:00.000Z", endsAt: "2022-04-03T00:00:00.000Z", sourcePriceVnd: "1500000", status: "closed" as const, needsReview: false, priceConfirmed: true, availableSeats: null };
  const base = (name: string, departures: object[]) => ({ id: randomUUID(), name, slug: name.toLowerCase().replace(/\s/g, "-"), category, departureLocation: "TP.HCM", durationDays: 3, images: [], coverImage: null, sourcePriceVnd: null, upcomingDepartures: 0, needsReview: false, days: [], sections: [], departures });
  const seed = snapshotSchema.parse({ version: 1, generatedAt: new Date().toISOString(), categories: [category], tours: [base("Tour cu", [stale]), base("Tour trong", [])] });
  const repo = createLocalAdminCatalog(join(directory, "catalog.json"), async () => seed);
  const id = seed.tours[0].id;
  assert.equal((await repo.list()).tours.find((tour) => tour.id === id)?.upcomingDepartures, 0);

  const auth = await createLocalAuthRepository(), adminId = randomUUID(), userId = randomUUID();
  t.after(() => auth.close());
  for (const [uid, token, role] of [[adminId, "a", "ADMIN"], [userId, "b", "USER"]] as const) {
    await auth.register({ id: uid, email: `${token}@refresh.test`, name: "T", passwordHash: "x", role: "USER" }, { id: randomUUID(), userId: uid, tokenHash: tokenDigest(token.repeat(64)), expiresAt: new Date(Date.now() + 3_600_000) });
    if (role === "ADMIN") await auth.promoteAdmin(`${token}@refresh.test`);
  }
  const app = express(); app.use(express.json()); app.use(createAdminCatalogRouter(() => repo, async () => auth));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const post = (token: string | null, body: unknown) => fetch(`http://127.0.0.1:${address.port}/departures/refresh`, { method: "POST", headers: { Origin: new URL(env.CLIENT_ORIGIN).origin, "Content-Type": "application/json", ...(token ? { Cookie: `${sessionCookieName}=${token.repeat(64)}` } : {}) }, body: JSON.stringify(body) });
  const tomorrow = new Date(Date.now() + 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
  const body = { startDate: tomorrow, gapDays: 7, dryRun: true };

  assert.equal((await post(null, body)).status, 401);
  assert.equal((await post("b", body)).status, 403);
  assert.equal((await post("a", { ...body, startDate: "2020-01-01" })).status, 400, "past start date rejected");
  assert.equal((await post("a", { ...body, gapDays: 0 })).status, 400);

  const preview = await (await post("a", body)).json();
  assert.deepEqual(preview.summary, { tours: 1, moved: 1, cloned: 0 });
  assert.equal((await repo.list()).tours.find((tour) => tour.id === id)?.upcomingDepartures, 0, "dry run changes nothing");

  const applied = await (await post("a", { ...body, dryRun: false })).json();
  assert.equal(applied.summary.moved, 1);
  const row = (await repo.list()).tours.find((tour) => tour.id === id)!;
  assert.equal(row.upcomingDepartures, 1);
  assert.equal(row.revision, 2, "revision bumps so stale editors must reload");
  const [moved] = (await repo.getDepartures(id)).departures;
  assert.equal(moved.id, stale.id); assert.equal(moved.status, "open"); assert.equal(moved.salePriceVnd, "1500000");
  assert.equal((await (await post("a", { ...body, dryRun: false })).json()).summary.tours, 0, "second run has nothing to do");
  assert.equal((await repo.publicCatalog()).tours.find((tour) => tour.id === id)?.upcomingDepartures, 1, "visible to Explore");
});

test("tours can be deleted by an Admin unless an upcoming departure has guests", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "pwy-delete-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const category = { id: randomUUID(), name: "Biển", slug: "bien" };
  const departure = (startsAt: string) => ({ id: randomUUID(), startsAt, endsAt: new Date(Date.parse(startsAt) + 86_400_000).toISOString(), sourcePriceVnd: "1000000", status: "open" as const, needsReview: false, priceConfirmed: true, availableSeats: null });
  const base = (name: string, departures: ReturnType<typeof departure>[]) => ({ id: randomUUID(), name, slug: name.toLowerCase().replace(/\s/g, "-"), category, departureLocation: "TP.HCM", durationDays: 3, images: [], coverImage: null, sourcePriceVnd: null, upcomingDepartures: 0, needsReview: false, days: [], sections: [], departures });
  const future = departure("2036-01-01T00:00:00.000Z");
  const seed = snapshotSchema.parse({ version: 1, generatedAt: new Date().toISOString(), categories: [category], tours: [base("Tour rat cu", [departure("2020-01-01T00:00:00.000Z")]), base("Tour co khach", [future])] });
  const [old, guarded] = seed.tours;
  const repo = createLocalAdminCatalog(join(directory, "catalog.json"), async () => seed);
  // Guests recorded on the future departure through the normal departure editor.
  await repo.saveDeparture(guarded.id, { revision: 1, startsAt: future.startsAt, endsAt: future.endsAt, basePriceVnd: "800000", salePriceVnd: "1000000", priceConfirmed: true, minPeople: 1, maxPeople: 10, bookedPeople: 3, status: "open" }, future.id);

  const auth = await createLocalAuthRepository(), adminId = randomUUID();
  t.after(() => auth.close());
  await auth.register({ id: adminId, email: "d@delete.test", name: "T", passwordHash: "x", role: "USER" }, { id: randomUUID(), userId: adminId, tokenHash: tokenDigest("d".repeat(64)), expiresAt: new Date(Date.now() + 3_600_000) });
  await auth.promoteAdmin("d@delete.test");
  await auth.writeReview(old.id, adminId, { rating: 4, comment: "", revision: 0 });
  assert.equal((await auth.listReviews(old.id, null, 1)).total, 1);

  const app = express(); app.use(express.json()); app.use(createAdminCatalogRouter(() => repo, async () => auth));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const remove = (id: string, body: unknown, token: string | null = "d") => fetch(`http://127.0.0.1:${address.port}/tours/${id}`, { method: "DELETE", headers: { Origin: new URL(env.CLIENT_ORIGIN).origin, "Content-Type": "application/json", ...(token ? { Cookie: `${sessionCookieName}=${token.repeat(64)}` } : {}) }, body: JSON.stringify(body) });

  assert.equal((await remove(old.id, { revision: 1 }, null)).status, 401);
  assert.equal((await remove("not-a-uuid", { revision: 1 })).status, 400);
  assert.equal((await remove(old.id, {})).status, 400);
  assert.equal((await remove(old.id, { revision: 9 })).status, 409, "stale revision");
  assert.equal((await remove(guarded.id, { revision: 2 })).status, 409, "upcoming guests block deletion");
  assert.equal((await repo.list()).tours.length, 2);

  assert.equal((await remove(old.id, { revision: 1 })).status, 204);
  assert.deepEqual((await repo.list()).tours.map((tour) => tour.id), [guarded.id]);
  assert.equal((await remove(old.id, { revision: 1 })).status, 404, "already gone");
  assert.equal((await auth.listReviews(old.id, null, 1)).total, 0, "its reviews are removed too");
  assert.ok(!(await repo.publicCatalog()).tours.some((tour) => tour.id === old.id));
});

test("past departures can be removed one by one or in bulk, upcoming ones with guests cannot", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "pwy-archive-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const category = { id: randomUUID(), name: "Biển", slug: "bien" };
  const departure = (startsAt: string) => ({ id: randomUUID(), startsAt, endsAt: new Date(Date.parse(startsAt) + 86_400_000).toISOString(), sourcePriceVnd: "1000000", status: "closed" as const, needsReview: false, priceConfirmed: true, availableSeats: null });
  const past = [departure("2020-01-01T00:00:00.000Z"), departure("2021-01-01T00:00:00.000Z")], future = departure("2036-01-01T00:00:00.000Z");
  const seed = snapshotSchema.parse({ version: 1, generatedAt: new Date().toISOString(), categories: [category], tours: [{ id: randomUUID(), name: "Tour", slug: "tour", category, departureLocation: "TP.HCM", durationDays: 3, images: [], coverImage: null, sourcePriceVnd: null, upcomingDepartures: 0, needsReview: false, days: [], sections: [], departures: [...past, future] }] });
  const repo = createLocalAdminCatalog(join(directory, "catalog.json"), async () => seed);
  const id = seed.tours[0].id;
  // Unknown guest count on a past departure no longer blocks removal; on an upcoming one it still does.
  await assert.rejects(repo.archiveDeparture(id, future.id, 1), { code: "departure_has_guests" });
  const one = await repo.archiveDeparture(id, past[0].id, 1);
  assert.equal(one.departures.length, 2);
  await assert.rejects(repo.archivePastDepartures(id, 1), { status: 409 }, "stale revision");
  const bulk = await repo.archivePastDepartures(id, one.revision);
  assert.deepEqual(bulk.departures.map((item) => item.id), [future.id], "only past departures are removed");
  assert.equal((await repo.list()).tours[0].totalDepartures, 1);
  await assert.rejects(repo.archivePastDepartures(randomUUID(), 1), { status: 404 });
});
