import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

test("frontend-only production never calls a visitor's localhost or a relative API", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    const load = async (path) => { const module = await import(path); return module.default ?? module; };
    const { API_URL, apiFetch } = await load('./src/lib/api.ts');
    const { generatePlan } = await load('./src/lib/planner.ts');
    const { askAssistant } = await load('./src/lib/assistant.ts');
    let calls = 0; globalThis.fetch = async () => { calls++; throw Error('Network must not be used'); };
    assert.equal(API_URL, '');
    await assert.rejects(apiFetch('health'), { code: 'backend_unconfigured' });
    await assert.rejects(generatePlan({prompt:'test'}, new AbortController().signal), { code: 'backend_unconfigured' });
    await assert.rejects(askAssistant('hello', [], new AbortController().signal), { code: 'backend_unconfigured' });
    assert.equal(calls, 0);
  `], { cwd: fileURLToPath(new URL("../../frontend/", import.meta.url)), env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_API_URL: "" }, encoding: "utf8", timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

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
