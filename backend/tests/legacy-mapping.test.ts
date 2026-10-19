import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMappingPlan, catalogId, type LegacyDataset } from "../src/legacy/mapping.js";
import { verifyMappingPlan } from "../scripts/verify-legacy.js";

const ids = { category: "1".repeat(24), tour: "2".repeat(24), place: "3".repeat(24), service: "4".repeat(24), departure: "5".repeat(24), day: "6".repeat(24), stop: "7".repeat(24) };
function fixture(): LegacyDataset {
  return {
    categories: [{ _id: ids.category, name: "Test category", slug: "test", status: "active" }],
    tours: [{ _id: ids.tour, name: "Test tour", slug: "test", status: "inactive", category_id: ids.category, start_location: "TP.HCM", duration: 3, hotel_id: "9".repeat(24) }],
    places: [{ _id: ids.place, title: "Test place", content: "Source content" }],
    services: [{ _id: ids.service, serviceName: "Test room", type: "hotel", unit: "per_room", basePrice: 1500000, description: "Source description", status: "active" }],
    trips: [{ _id: ids.departure, tour_id: ids.tour, start_date: new Date("2026-12-01T00:00:00Z"), end_date: new Date("2026-12-03T00:00:00Z"), base_price: 848214.2857142857, price: 1019000, min_people: 5, max_people: 10, booked_people: 2, status: "open", services: [{ service_id: ids.service, unit_price: 1250000, quantity: 2 }] }],
    itineraries: [{ _id: ids.day, tour_id: ids.tour, day_number: 1, title: "Test day" }],
    itinerary_details: [{ _id: ids.stop, itinerary_id: ids.day, place_id: ids.place, type: "visit", title: "Visit", content: "Test", order: 1 }],
    tour_images: [{ _id: "a".repeat(24), tour_id: ids.tour, image_url: "https://example.test/tour.jpg" }],
    place_images: [{ _id: "b".repeat(24), place_id: ids.place, image_url: "https://example.test/place.jpg" }],
    descriptions: [{ _id: "c".repeat(24), tour_id: ids.tour, title: "Includes", content: "Test" }],
    sales: [{ _id: "d".repeat(24), tour_id: ids.tour, discount: 10 }],
  };
}

test("maps tour catalog without inventing location, price units or personal trips", () => {
  const plan = buildMappingPlan("test-db", fixture());
  assert.equal(plan.tours[0].status, "inactive");
  assert.equal(plan.services[0].unit, "per_room");
  assert.equal(plan.services[0].needsReview, true);
  assert.equal(plan.places[0].destinationId, undefined);
  assert.equal(plan.departures[0].basePriceVnd, "848214.2857142857");
  assert.equal(plan.departureServices[0].unitPriceVnd, "1250000");
  assert.equal(plan.tours[0].legacyHotelId, "9".repeat(24));
  assert.equal(plan.issues.filter((issue) => issue.severity === "rejected").length, 0);
});
test("quarantines invalid occupancy and dangling references", () => {
  const data = fixture();
  data.trips![0].booked_people = -4;
  data.itinerary_details![0].place_id = "f".repeat(24);
  const plan = buildMappingPlan("test-db", data);
  assert.equal(plan.departures.length, 0);
  assert.equal(plan.departureServices.length, 0);
  assert.equal(plan.stops.length, 0);
  assert.ok(plan.issues.some((issue) => issue.code === "MISSING_REFERENCE_PLACES"));
});
test("preserves duplicate source ordering with warnings", () => {
  const data = fixture();
  data.itineraries!.push({ ...data.itineraries![0], _id: "e".repeat(24) });
  data.itinerary_details!.push({ ...data.itinerary_details![0], _id: "f".repeat(24) });
  const plan = buildMappingPlan("test-db", data);
  assert.equal(plan.days.length, 2);
  assert.equal(plan.stops.length, 2);
  assert.ok(plan.issues.some((issue) => issue.code === "DUPLICATE_TOUR_DAY" && issue.severity === "warning"));
  assert.ok(plan.issues.some((issue) => issue.code === "DUPLICATE_STOP_POSITION" && issue.severity === "warning"));
});
test("source identity is deterministic and separated across databases and collections", () => {
  assert.equal(catalogId("db", "tours", ids.tour), catalogId("db", "tours", ids.tour));
  assert.notEqual(catalogId("db", "tours", ids.tour), catalogId("other-db", "tours", ids.tour));
  assert.notEqual(catalogId("db", "tours", ids.tour), catalogId("db", "places", ids.tour));
});
test("rejects unsupported units and unsafe image URLs", () => {
  const data = fixture();
  data.services![0].unit = "unknown";
  data.tour_images![0].image_url = "javascript:alert(1)";
  const plan = buildMappingPlan("test-db", data);
  assert.equal(plan.services.length, 0);
  assert.equal(plan.images.length, 1);
  assert.equal(plan.departureServices.length, 0);
});
test("mapped catalog satisfies all migrations and can be inserted twice", async () => {
  const result = await verifyMappingPlan(buildMappingPlan("test-db", fixture()));
  assert.equal(result.rerun, "passed");
});
