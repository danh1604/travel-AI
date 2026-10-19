import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createCatalogRouter } from "../src/catalog/router.js";
import { projectCatalog } from "../src/catalog/project.js";
import { CatalogUnavailable } from "../src/catalog/repository.js";
import { buildMappingPlan } from "../src/legacy/mapping.js";

const categoryId = "1".repeat(24), firstId = "2".repeat(24), secondId = "3".repeat(24);
const catalog = projectCatalog(buildMappingPlan("test", {
  categories: [{ _id: categoryId, name: "Tour biển", slug: "bien", status: "active" }],
  tours: [
    { _id: firstId, name: "Đà Nẵng thư giãn", slug: "da-nang", category_id: categoryId, status: "active", start_location: "TP.HCM", duration: 3 },
    { _id: secondId, name: "Phú Quốc", slug: "phu-quoc", category_id: categoryId, status: "active", start_location: "TP.HCM", duration: 4 },
    { _id: "4".repeat(24), name: "Inactive tour", slug: "inactive", category_id: categoryId, status: "inactive", start_location: "TP.HCM" },
  ],
  trips: [{ _id: "5".repeat(24), tour_id: firstId, start_date: new Date("2030-01-01Z"), end_date: new Date("2030-01-03Z"), price: 2500000, base_price: 2000000, min_people: 2, max_people: 4, booked_people: 1, status: "open", services: [] }],
}));

test("Explore API searches, paginates and exposes only public catalog fields", async (t) => {
  const app = express(); app.use("/api/explore", createCatalogRouter(async () => catalog));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/explore`;
  try {
    await t.test("Vietnamese search works without accents", async () => {
      const response = await fetch(`${base}/tours?q=da%20nang`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const result = await response.json(); assert.equal(result.data.length, 1); assert.equal(result.data[0].name, "Đà Nẵng thư giãn");
      assert.equal(result.meta.developmentData, true); assert.equal(result.meta.priceUnit, "unconfirmed");
      assert.equal(result.data[0].sourcePriceVnd, "2500000");
      assert.ok(!("departures" in result.data[0])); assert.ok(!("sourceId" in result.data[0]));
    });
    await t.test("pagination is stable and preserves total", async () => {
      const first = await (await fetch(`${base}/tours?limit=1&page=1`)).json();
      const second = await (await fetch(`${base}/tours?limit=1&page=2`)).json();
      assert.equal(first.pagination.total, 2); assert.notEqual(first.data[0].id, second.data[0].id);
      assert.equal((await (await fetch(`${base}/tours?page=999`)).json()).data.length, 0);
    });
    await t.test("category filter, empty result and input validation", async () => {
      const id = catalog.categories[0].id;
      assert.equal((await (await fetch(`${base}/tours?category=${id}`)).json()).pagination.total, 2);
      assert.equal((await (await fetch(`${base}/tours?q=not-found`)).json()).pagination.total, 0);
      for (const query of ["page=0", "limit=100", "category=invalid", "q[]=x", `q=${"x".repeat(101)}`]) {
        assert.equal((await fetch(`${base}/tours?${query}`)).status, 400);
      }
    });
    await t.test("detail response and missing tour", async () => {
      const detail = await (await fetch(`${base}/tours/${catalog.tours[0].id}`)).json();
      assert.equal(detail.data.departures.length, 1);
      assert.equal(detail.data.departures[0].sourcePriceVnd, "2500000");
      assert.ok(!("bookedPeople" in detail.data.departures[0])); assert.ok(!("legacyHotelId" in detail.data));
      assert.equal((await fetch(`${base}/tours/00000000-0000-4000-8000-000000000000`)).status, 404);
      assert.equal((await fetch(`${base}/tours/invalid`)).status, 400);
    });
  } finally { server.close(); }
});
test("inactive/deleted data and expired source prices are not promoted", () => {
  assert.equal(catalog.tours.length, 2);
  const expired = projectCatalog(buildMappingPlan("test", {
    categories: [{ _id: categoryId, name: "Test", slug: "test", status: "active" }],
    tours: [{ _id: firstId, name: "Test", slug: "test", category_id: categoryId, status: "active", start_location: "Test" }],
    trips: [
      { _id: "5".repeat(24), tour_id: firstId, start_date: new Date("2020-01-01Z"), end_date: new Date("2020-01-03Z"), price: 5000, base_price: 4000, min_people: 1, max_people: 2, booked_people: 1, status: "open", services: [] },
      { _id: "6".repeat(24), tour_id: firstId, start_date: new Date("2030-01-01Z"), end_date: new Date("2030-01-03Z"), price: 5000, base_price: 4000, min_people: 1, max_people: 2, booked_people: 1, status: "deleted", services: [] },
    ],
  }));
  assert.equal(expired.tours[0].sourcePriceVnd, null); assert.equal(expired.tours[0].departures.length, 1);
});
test("unavailable catalog returns 503 without internal details", async () => {
  const app = express(); app.use("/", createCatalogRouter(async () => { throw new CatalogUnavailable("private internal detail"); }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const result = await fetch(`http://127.0.0.1:${address.port}/tours`);
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: "Catalog unavailable" });
  } finally { server.close(); }
});

test("upcoming departure search excludes old, closed, full and insufficient seats without exposing unconfirmed prices", async () => {
  const now = Date.parse("2030-01-01T02:00:00Z");
  const copy = structuredClone(catalog);
  const departure = { ...copy.tours[0].departures[0], startsAt: "2030-01-20T01:00:00Z", endsAt: "2030-01-22T12:00:00Z", status: "open" as const, sourcePriceVnd: "3000000", priceConfirmed: true, availableSeats: 4 };
  copy.tours[0].departures = [
    departure,
    { ...departure, id: "old", startsAt: "2029-12-31T01:00:00Z" },
    { ...departure, id: "closed", status: "closed" },
    { ...departure, id: "full", status: "full" },
    { ...departure, id: "insufficient", availableSeats: 1 },
    { ...departure, id: "invalid-range", endsAt: "2030-01-01T00:00:00Z" },
    { ...departure, id: "unknown-price", startsAt: "2030-01-24T01:00:00Z", endsAt: "2030-01-26T12:00:00Z", priceConfirmed: false, availableSeats: null },
  ];
  const app = express(); app.use(createCatalogRouter(async () => copy, () => now));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/upcoming-departures`;
  try {
    const response = await fetch(`${base}?destination=da%20nang&people=2&startDate=2030-01-22&days=3`);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.deepEqual(result.data.map((item: { departureId: string }) => item.departureId), ["unknown-price", departure.id]);
    assert.equal(result.data[0].availableSeats, null); assert.equal(result.data[0].perPersonVnd, null); assert.equal(result.data[0].totalVnd, null);
    assert.equal(result.data[1].perPersonVnd, "3000000"); assert.equal(result.data[1].totalVnd, "6000000");
    assert.equal(result.checkedAt, new Date(now).toISOString());
    const noGroup = await (await fetch(`${base}?destination=da%20nang`)).json();
    assert.equal(noGroup.data[0].perPersonVnd, "3000000"); assert.equal(noGroup.data[0].totalVnd, null);
    assert.deepEqual((await (await fetch(`${base}?destination=TP.HCM`)).json()).data, []);
    for (const query of ["people=0", "people=51", "days=15", "startDate=2030-02-30", "unknown=x", "destination[]=x"]) assert.equal((await fetch(`${base}?${query}`)).status, 400);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
