import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { loadGuides } from "../src/catalog/guides.js";
import { createCatalogRouter } from "../src/catalog/router.js";
import { createPlannerService } from "../src/planner/service.js";

test("curated external records have provenance, unknown prices and destination filtering", async () => {
  const guides = await loadGuides();
  assert.equal(guides.length, 79); assert.equal(new Set(guides.map((g) => g.id)).size, 79);
  assert.equal(new Set(guides.map((g) => g.destination)).size, 16);
  assert.equal(new Set(guides.map((g) => g.source.url)).size, 20);
  for (const guide of guides) { assert.equal(guide.priceVnd, null); assert.equal(guide.openingHours, null); assert.equal(new URL(guide.source.url).search, ""); assert.equal(guide.checkedAt, "2026-10-18"); }
  assert.equal((await loadGuides("Hue")).length, 6);
  assert.equal((await loadGuides("Thành phố Đà Nẵng")).length, 7);
  assert.equal((await loadGuides("Unknown")).length, 0);
});
test("Planner can use external places without manufacturing tours, departures or costs", async () => {
  const constraints = { destination: "Huế", days: 2, people: 2, budgetVnd: 10000000, startDate: "2030-10-22", style: "relaxed" };
  const service = createPlannerService({
    ai: { async call(name) { return name === "search_tours" ? constraints : { days: [{ dayNumber: 1, activities: [{ ref: "g0", period: "morning" }] }, { dayNumber: 2, activities: [{ ref: "g1", period: "afternoon" }] }] }; } },
    catalog: async () => ({ version: 1, generatedAt: "2030-01-01T00:00:00Z", tours: [], categories: [] }),
    weather: async () => ({ status: "outside_forecast", days: [] }), guides: loadGuides, clock: () => Date.parse("2030-01-01T00:00:00Z"),
  });
  const result = await service({ prompt: "Đi Huế hai ngày" }, AbortSignal.timeout(1000));
  assert.equal(result.status, "ready"); if (result.status !== "ready") return;
  assert.equal(result.days[0].activities[0].source.tourId, null);
  assert.equal(result.days[0].activities[0].source.dayNumber, null);
  assert.equal(result.days[0].activities[0].source.url, "https://vietnam.travel/things-to-do/hue-itinerary");
  assert.equal(result.days[0].activities[0].costVnd, null);
  assert.deepEqual(result.packageQuotes, []);
});
test("public guide endpoint validates filters and does not require a live tour database", async () => {
  const app = express(); app.use(createCatalogRouter(async () => { throw new Error("not used"); }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((r) => server.once("listening", r));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/guides?destination=Hue`);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).data.length, 6);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/guides?destination[]=Hue`)).status, 400);
  } finally { await new Promise<void>((r) => server.close(() => r())); }
});
