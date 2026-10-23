import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { sessionCookieName, tokenDigest } from "../src/auth/router.js";
import { createAdminTravelRouter, createTravelRouter } from "../src/travel/router.js";
import { env } from "../src/config/env.js";

test("travel catalogue: public browsing, admin CRUD, validation and concurrency", async (t) => {
  const repo = await createLocalAuthRepository();
  for (const [token, role] of [["a", "USER"], ["b", "ADMIN"]] as const) {
    const id = randomUUID();
    await repo.register({ id, email: `${token}@travel.test`, name: `Người dùng ${token}`, passwordHash: "test-only", role: "USER" }, { id: randomUUID(), userId: id, tokenHash: tokenDigest(token.repeat(64)), expiresAt: new Date(Date.now() + 3_600_000) });
    if (role === "ADMIN") await repo.promoteAdmin(`${token}@travel.test`);
  }
  const app = express(); app.use(express.json());
  app.use("/travel", createTravelRouter(async () => repo)); app.use("/admin/travel", createAdminTravelRouter(async () => repo));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const headers = (token?: string, extra = {}) => ({ Origin: new URL(env.CLIENT_ORIGIN).origin, "Content-Type": "application/json", ...(token ? { Cookie: `${sessionCookieName}=${token.repeat(64)}` } : {}), ...extra });
  const send = (method: string, path: string, body: unknown, token?: string, extra = {}) => fetch(base + path, { method, headers: headers(token, extra), body: JSON.stringify(body) });
  try {
    await t.test("seeded demo data is public, filtered, sorted by price and flagged as demo", async () => {
      const destinations = await (await fetch(`${base}/travel/destinations`)).json();
      assert.ok(destinations.data.length >= 3);
      assert.ok(destinations.data.every((d: { counts: Record<string, number> }) => d.counts.hotels >= 1));
      const hotels = await (await fetch(`${base}/travel/hotels?destination=da-nang&sort=price`)).json();
      assert.ok(hotels.data.length >= 3);
      const prices = hotels.data.map((h: { priceVnd: string }) => BigInt(h.priceVnd));
      assert.deepEqual(prices, [...prices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      assert.ok(hotels.data.every((h: { destinationSlug: string; source: string; costUnit: string }) => h.destinationSlug === "da-nang" && h.source === "DEMO" && h.costUnit === "PER_ROOM_NIGHT"));
      const cheap = await (await fetch(`${base}/travel/hotels?destination=da-nang&maxPrice=500000`)).json();
      assert.ok(cheap.data.length >= 1 && cheap.data.every((h: { priceVnd: string }) => BigInt(h.priceVnd) <= 500000n));
      const search = await (await fetch(`${base}/travel/restaurants?q=${encodeURIComponent("hai san")}`)).json();
      assert.ok(search.data.length >= 1, "accent-insensitive search");
      const detail = await (await fetch(`${base}/travel/destinations/da-lat`)).json();
      assert.equal(detail.data.destination.slug, "da-lat");
      assert.ok(detail.data.attractions.length >= 1 && detail.data.transportations.length >= 1);
    });
    await t.test("public API rejects bad input and unknown resources", async () => {
      assert.equal((await fetch(`${base}/travel/hotels?limit=500`)).status, 400);
      assert.equal((await fetch(`${base}/travel/hotels?maxPrice=abc`)).status, 400);
      assert.equal((await fetch(`${base}/travel/hotels?destination=${encodeURIComponent("'; DROP TABLE")}`)).status, 400);
      assert.equal((await fetch(`${base}/travel/hotels?evil=1`)).status, 400);
      assert.equal((await fetch(`${base}/travel/spaceships`)).status, 404);
      assert.equal((await fetch(`${base}/travel/destinations/khong-co`)).status, 404);
      assert.equal((await fetch(`${base}/travel/destinations/Bad_Slug`)).status, 400);
    });
    await t.test("admin API requires an ADMIN session, trusted origin and JSON", async () => {
      assert.equal((await fetch(`${base}/admin/travel/hotels`)).status, 401);
      assert.equal((await fetch(`${base}/admin/travel/hotels`, { headers: headers("a") })).status, 403);
      assert.equal((await fetch(`${base}/admin/travel/hotels`, { headers: headers("b") })).status, 200);
      assert.equal((await send("POST", "/admin/travel/hotels", {}, "b", { Origin: "https://attacker.test" })).status, 403);
      assert.equal((await send("POST", "/admin/travel/hotels", {}, "b", { "Content-Type": "text/plain" })).status, 415);
      assert.equal((await send("POST", "/admin/travel/hotels", {}, "a")).status, 403);
    });
    let hotel: { id: string; revision: number; destinationId: string };
    await t.test("admin creates, validates, edits with revisions and hides a hotel", async () => {
      const list = await (await fetch(`${base}/admin/travel/destinations`, { headers: headers("b") })).json();
      const destinationId = list.data.find((d: { slug: string }) => d.slug === "da-nang").id;
      const valid = { name: "Khách sạn Thử Nghiệm", slug: "khach-san-thu-nghiem", destinationId, address: "1 Đường Thử", priceVnd: "900000", roomCapacity: 2, tags: ["gần biển"] };
      for (const bad of [{ ...valid, priceVnd: "-1" }, { ...valid, priceVnd: "9.5" }, { ...valid, costUnit: "PER_PERSON" }, { ...valid, slug: "Bad Slug" }, { ...valid, roomCapacity: 0 }, { ...valid, destinationId: "nope" }, { ...valid, sourceUrl: "http://insecure.test" }, { ...valid, extra: 1 }])
        assert.equal((await send("POST", "/admin/travel/hotels", bad, "b")).status, 400, JSON.stringify(bad).slice(0, 80));
      assert.equal((await send("POST", "/admin/travel/hotels", { ...valid, destinationId: randomUUID() }, "b")).status, 400);
      const created = await send("POST", "/admin/travel/hotels", valid, "b"); assert.equal(created.status, 201);
      hotel = (await created.json()).data; assert.equal(hotel.revision, 1);
      assert.equal((await send("POST", "/admin/travel/hotels", valid, "b")).status, 409, "duplicate slug");
      const edited = await send("PATCH", `/admin/travel/hotels/${hotel.id}`, { ...valid, priceVnd: "950000", revision: 1 }, "b");
      assert.equal(edited.status, 200); const saved = (await edited.json()).data;
      assert.equal(saved.revision, 2); assert.equal(saved.priceVnd, "950000");
      assert.equal((await send("PATCH", `/admin/travel/hotels/${hotel.id}`, { ...valid, revision: 1 }, "b")).status, 409, "stale revision");
      assert.equal((await send("PATCH", `/admin/travel/hotels/${randomUUID()}`, { ...valid, revision: 1 }, "b")).status, 404);
      assert.equal((await send("PATCH", `/admin/travel/hotels/${hotel.id}`, valid, "b")).status, 400, "revision required");
      hotel.revision = 2;
    });
    await t.test("hidden services and hidden destinations disappear from the public catalogue", async () => {
      const find = async () => (await (await fetch(`${base}/travel/hotels?q=Th%E1%BB%AD+Nghi%E1%BB%87m`)).json()).data;
      assert.equal((await find()).length, 1);
      const current = (await (await fetch(`${base}/admin/travel/hotels?q=thu+nghiem`, { headers: headers("b") })).json()).data[0];
      const { id, revision, updatedAt: _u, destinationName: _n, destinationSlug: _s, ...fields } = current;
      assert.equal((await send("PATCH", `/admin/travel/hotels/${id}`, { ...fields, isActive: false, revision }, "b")).status, 200);
      assert.equal((await find()).length, 0);
      assert.equal((await (await fetch(`${base}/admin/travel/hotels?status=inactive`, { headers: headers("b") })).json()).pagination.total, 1);
      const dest = (await (await fetch(`${base}/admin/travel/destinations?q=phu+quoc`, { headers: headers("b") })).json()).data[0];
      const { id: destId, revision: destRevision, updatedAt: _d, ...destFields } = dest;
      assert.equal((await send("PATCH", `/admin/travel/destinations/${destId}`, { ...destFields, isActive: false, revision: destRevision }, "b")).status, 200);
      assert.equal((await fetch(`${base}/travel/destinations/phu-quoc`)).status, 404);
      assert.equal((await (await fetch(`${base}/travel/hotels?destination=phu-quoc`)).json()).data.length, 0);
    });
    await t.test("each service kind validates its own cost-unit rules", async () => {
      const destinationId = (await (await fetch(`${base}/admin/travel/destinations?q=da+lat`, { headers: headers("b") })).json()).data[0].id;
      const attraction = { name: "Điểm thử", slug: "diem-thu", destinationId, address: "x", priceVnd: "0", costUnit: "PER_GROUP", durationMinutes: 60, isIndoor: true };
      assert.equal((await send("POST", "/admin/travel/attractions", attraction, "b")).status, 201);
      assert.equal((await send("POST", "/admin/travel/attractions", { ...attraction, slug: "diem-thu-2", costUnit: "PER_ROOM_NIGHT" }, "b")).status, 400);
      const transport = { name: "Xe thử", slug: "xe-thu", destinationId, departure: "TP.HCM", mode: "BUS", priceVnd: "100000", costUnit: "PER_PERSON", capacity: 40, durationMinutes: 300 };
      assert.equal((await send("POST", "/admin/travel/transportations", transport, "b")).status, 201);
      assert.equal((await send("POST", "/admin/travel/transportations", { ...transport, slug: "xe-thu-2", mode: "ROCKET" }, "b")).status, 400);
      const meal = { name: "Quán thử", slug: "quan-thu", destinationId, address: "x", priceVnd: "50000", foodOptions: ["chay"] };
      assert.equal((await send("POST", "/admin/travel/restaurants", meal, "b")).status, 201);
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); await repo.close(); }
});
