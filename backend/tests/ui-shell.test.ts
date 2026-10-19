import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTripDate, groupDayActivities, departureComparison } from "../../frontend/src/lib/itinerary-presentation.ts";
import type { ReadyPlan, TourSuggestion } from "../../frontend/src/lib/planner.ts";
import { adminAccess, adminReturnPath } from "../../frontend/src/lib/admin-access.ts";
import {
  probePath,
  probeStatus,
  type ProbeId,
} from "../../frontend/src/lib/api-lab.ts";

const options = {
  q: "Đà Nẵng & biển",
  category: "test-category",
  page: "2",
  limit: "3",
  tourId: "abc",
};

test("admin pages remain hidden until the current route has a verified admin session", () => {
  const state = { loading: false, error: false, role: "ADMIN", checked: "/admin/tours", pathname: "/admin/tours" };
  assert.equal(adminAccess(state), "allowed");
  assert.equal(adminAccess({ ...state, loading: true }), "checking");
  assert.equal(adminAccess({ ...state, checked: "/account" }), "checking");
  assert.equal(adminAccess({ ...state, error: true }), "unavailable");
  assert.equal(adminAccess({ ...state, role: null }), "login");
  assert.equal(adminAccess({ ...state, role: "USER" }), "forbidden");
});

test("admin login only returns to safe local admin paths", () => {
  assert.equal(adminReturnPath("/admin/tours/123/content"), "/admin/tours/123/content");
  for (const path of [undefined, "https://attacker.test", "//attacker.test", "/account", "/admin/login", "/admin/login/next", "/admin/../account", "/admin/%2f%2fattacker.test", "/admin\\attacker.test", "/admin/tours?next=https://attacker.test"]) assert.equal(adminReturnPath(path), "/admin");
});
test("API Lab encodes search inputs without changing the endpoint", () => {
  const url = new URL(
    probePath("tours", options),
    "http://localhost:4000/api/",
  );
  assert.equal(url.pathname, "/api/explore/tours");
  assert.equal(url.searchParams.get("q"), options.q);
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("category"), "test-category");
});
test("API Lab cannot be redirected to arbitrary routes or logout", () => {
  assert.throws(() => probePath("logout" as ProbeId, options), /Unknown probe/);
  assert.throws(() => probePath("detail", { ...options, tourId: " " }));
  assert.throws(() => probePath("detail", { ...options, tourId: ".." }));
  const path = probePath("detail", {
    ...options,
    tourId: "../../auth/logout?x=1",
  });
  const url = new URL(path, "http://localhost:4000/api/");
  assert.equal(
    url.pathname,
    "/api/explore/tours/..%2F..%2Fauth%2Flogout%3Fx%3D1",
  );
  assert.equal(url.search, "");
});
test("expected authorization/readiness states are distinguished from catalog failures", () => {
  assert.equal(probeStatus("ready", 503).tone, "notice");
  assert.equal(probeStatus("tours", 503).tone, "error");
  assert.equal(probeStatus("account", 401).tone, "notice");
  assert.equal(probeStatus("admin", 403).tone, "notice");
  assert.equal(probeStatus("me", 200).tone, "success");
  assert.equal(probeStatus("health", 0).tone, "error");
});

test("itinerary groups out-of-order periods without altering activities or source references", () => {
  const activity = (ref: string, period: "morning" | "afternoon" | "evening"): ReadyPlan["days"][number]["activities"][number] => ({ ref, period, title: ref, content: "Nội dung tham khảo", placeName: null, costVnd: null, source: { tourId: null, tourName: "Nguồn công khai", dayNumber: null, needsReview: false, url: "https://example.com/guide" } });
  const day = { dayNumber: 1, date: "2030-01-01", activities: [activity("evening", "evening"), activity("morning-1", "morning"), activity("morning-2", "morning")] };
  const original = structuredClone(day);
  const groups = groupDayActivities(day);
  assert.deepEqual(groups.map((group) => group.activities.map((a) => a.ref)), [["morning-1", "morning-2"], [], ["evening"]]);
  assert.equal(groups[0].activities[0].source, day.activities[1].source);
  assert.deepEqual(day, original);
});

test("travel dates remain calendar dates and departure comparison handles early, exact and unknown dates", () => {
  assert.equal(formatTripDate("2030-01-01"), "01/01/2030");
  assert.equal(formatTripDate("2030-12-31"), "31/12/2030");
  const quote: TourSuggestion = { tourId: "tour", tourName: "Tour", departureId: "departure", startsOn: "2030-01-20", endsOn: "2030-01-22", durationDays: 3, requestedStartDate: "2030-01-22", dayDifference: -2, availableSeats: null, perPersonVnd: null, totalVnd: null, withinBudget: null };
  assert.equal(departureComparison(quote), "Sớm hơn 2 ngày");
  assert.equal(departureComparison({ ...quote, dayDifference: 2 }), "Muộn hơn 2 ngày");
  assert.equal(departureComparison({ ...quote, dayDifference: 0 }), "Đúng ngày bạn chọn");
  assert.equal(departureComparison({ ...quote, requestedStartDate: null }), "Lịch sắp khởi hành");
});
