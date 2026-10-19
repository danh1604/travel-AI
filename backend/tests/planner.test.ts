import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createPlannerAI, PlannerAIError, type PlannerAI } from "@pickyourway/ai-services";
import { plannerRequest, type Constraints } from "../src/planner/contracts.js";
import { createPlannerService, findCandidates, sourceStops, resolveSelection, packageQuotes } from "../src/planner/service.js";
import { createWeatherTool, type WeatherResult } from "../src/planner/weather.js";
import { createPlannerRouter } from "../src/planner/router.js";
import { readPlannerStream } from "../../frontend/src/lib/planner-stream.ts";
import { snapshotSchema } from "../src/catalog/contracts.js";
import type { AuthRepository } from "../src/auth/types.js";
import { plannerPreferences, excludedActivity, dailyActivityLimit } from "../src/planner/preferences.js";

const now = Date.parse("2030-01-01T02:00:00Z");
const id = "11111111-1111-4111-8111-111111111111";
const catalog = snapshotSchema.parse({ version: 1, generatedAt: new Date(now).toISOString(), categories: [], tours: [{
  id, slug: "da-nang", name: "Đà Nẵng 2 ngày", category: { id, name: "Biển", slug: "bien" }, departureLocation: "Hà Nội", durationDays: 2, coverImage: null, sourcePriceVnd: null, upcomingDepartures: 0, needsReview: true,
  images: [], sections: [], departures: [], days: [1, 2].map((dayNumber) => ({ id, dayNumber, title: `Ngày ${dayNumber}`, mealNote: null, stops: [{ id, type: "attraction", title: dayNumber === 1 ? "Biển Mỹ Khê" : "Cầu Rồng", content: "Nội dung từ nguồn", position: 0, placeName: null }] })),
}] });
const constraints: Constraints = { destination: "Đà Nẵng", days: 2, people: 2, budgetVnd: 10_000_000, startDate: "2030-01-02", style: "relaxed" };
const validSelection = { days: [{ dayNumber: 1, activities: [{ ref: "t0d0s0", period: "morning" as const }] }, { dayNumber: 2, activities: [{ ref: "t0d1s0", period: "afternoon" as const }] }] };
const weather: WeatherResult = { status: "not_configured", days: [] };
const input = { prompt: "Đà Nẵng 2 ngày, 2 người, 10 triệu" };
function fakeAI(results: unknown[]): PlannerAI { return { async call() { assert.ok(results.length); return results.shift(); } }; }
function service(results: unknown[], overrides = {}) { return createPlannerService({ ai: fakeAI(results), catalog: async () => catalog, weather: async () => weather, clock: () => now, ...overrides }); }

test("preferences track changed interests, explicit exclusions and chatbot handoff labels", () => {
  const preferences = plannerPreferences("Thích biển, không muốn đi biển nữa, thích văn hóa, đi cùng bố mẹ và ít đi bộ");
  assert.deepEqual(preferences.wanted, ["văn hóa"]); assert.deepEqual(preferences.excluded, ["biển"]);
  assert.ok(preferences.notes); assert.equal(excludedActivity(preferences, "Biển Mỹ Khê"), true);
  assert.equal(excludedActivity(preferences, "Cầu Rồng"), false);
  assert.deepEqual(plannerPreferences("Không đi biển, nhưng thích biển trở lại").excluded, []);
  assert.deepEqual(plannerPreferences("Bạn thích cà phê / Không chọn trải nghiệm: biển, leo núi").excluded, ["biển", "leo núi"]);
  assert.deepEqual(plannerPreferences("Không biết nên chọn biển hay thiên nhiên").excluded, []);
});

test("excluded activities cannot be chosen by the model, without another AI call", async () => {
  let calls = 0;
  const ai: PlannerAI = { async call(name, _description, parameters, payload) {
    calls++; assert.equal(name, "build_itinerary");
    const context = payload as { stops: { ref: string }[]; resolvedPreferences: { excluded: string[] }; planningRules: { maxActivitiesPerDay: number } };
    assert.deepEqual(context.resolvedPreferences.excluded, ["biển"]);
    assert.ok(!context.stops.some((stop) => stop.ref === "t0d0s0"));
    assert.equal(context.planningRules.maxActivitiesPerDay, 4);
    assert.ok(!JSON.stringify(parameters).includes('"t0d0s0"'));
    return { days: [{ dayNumber: 1, activities: [{ ref: "t0d1s0", period: "afternoon" }] }, { dayNumber: 2, activities: [] }] };
  } };
  const result = await service([], { ai })({ destination: "Đà Nẵng", days: 2, people: 2, budgetVnd: 10000000, style: "balanced", prompt: "Không muốn đi biển, đi cùng ba mẹ, thích lịch nhẹ nhàng" }, AbortSignal.timeout(1000));
  assert.equal(calls, 1); assert.equal(result.status, "ready");
  if (result.status === "ready") { assert.match(result.warnings.join(" "), /khả năng tiếp cận/); assert.equal(result.days[0].activities[0].title, "Cầu Rồng"); }
});

test("no suitable source after exclusions asks for a change before weather or generation", async () => {
  const copy = structuredClone(catalog);
  copy.tours[0].days.forEach((day) => { day.stops[0].title = "Biển Mỹ Khê"; });
  const run = service([], { catalog: async () => copy, weather: async () => { throw new Error("must not call weather"); } });
  const result = await run({ destination: "Đà Nẵng", days: 2, people: 2, budgetVnd: 10000000, style: "relaxed", prompt: "Không đi biển nhé" }, AbortSignal.timeout(1000));
  assert.equal(result.status, "no_data");
});

test("daily limits distinguish relaxed, balanced and active without dropping excess silently", () => {
  assert.deepEqual([dailyActivityLimit("relaxed"), dailyActivityLimit("balanced"), dailyActivityLimit("active")], [3, 4, 6]);
  const copy = structuredClone(catalog.tours);
  copy[0].days[0].stops = Array.from({ length: 5 }, (_, index) => ({ ...copy[0].days[0].stops[0], title: `Điểm nguồn ${index}`, position: index }));
  const selection = { days: [{ dayNumber: 1, activities: Array.from({ length: 5 }, (_, index) => ({ ref: `t0d0s${index}`, period: "morning" as const })) }, { dayNumber: 2, activities: [] }] };
  assert.throws(() => resolveSelection(selection, { ...constraints, style: "balanced" }, sourceStops(copy)), PlannerAIError);
  assert.equal(resolveSelection(selection, { ...constraints, style: "active" }, sourceStops(copy))[0].activities.length, 5);
});

test("complete form skips extraction, constrains source references and reports actual stages", async () => {
  const stages: string[] = [], calls: string[] = [];
  const ai: PlannerAI = { async call(name, _description, parameters) {
    calls.push(name); assert.equal(name, "build_itinerary");
    const schema = parameters as { properties: { days: { maxItems: number } } };
    assert.equal(schema.properties.days.maxItems, 2);
    return validSelection;
  } };
  const result = await service([], { ai })({ ...input, destination: constraints.destination!, days: constraints.days!, people: constraints.people!, budgetVnd: constraints.budgetVnd!, startDate: constraints.startDate!, style: constraints.style }, AbortSignal.timeout(1000), (stage) => stages.push(stage));
  assert.equal(result.status, "ready"); if (result.status !== "ready") return;
  assert.equal(result.evidence.modelCalls, 1); assert.deepEqual(calls, ["build_itinerary"]);
  assert.deepEqual(stages, ["searching", "weather", "building", "validating"]);
});
test("streamed Planner carries progress, private draft ID and errors without losing Unicode", async () => {
  const app = express(); app.use(express.json());
  const auth = { async findSession() { return { id, role: "USER" }; }, async createPlanDraft() { return id; } } as unknown as AuthRepository;
  app.use("/success", createPlannerRouter(service([constraints, validSelection]), async () => auth));
  app.use("/failure", createPlannerRouter(async () => { throw new PlannerAIError("ai_invalid_output"); }, async () => auth));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((r) => server.once("listening", r));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const post = (path: string) => fetch(`http://127.0.0.1:${address.port}/${path}/generate`, { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", Accept: "text/event-stream", Cookie: `pwy_session=${"a".repeat(64)}` }, body: JSON.stringify(input) });
  try {
    const response = await post("success"); const stages: string[] = [];
    assert.match(response.headers.get("content-type")!, /text\/event-stream/);
    const result = await readPlannerStream(response.body!, (stage) => stages.push(stage));
    assert.equal(result.status, "ready"); if (result.status === "ready") { assert.equal(result.draftId, id); assert.equal(result.days[0].activities[0].title, "Biển Mỹ Khê"); }
    assert.deepEqual(stages, ["understanding", "searching", "weather", "building", "validating", "saving"]);
    const failed = await post("failure");
    await assert.rejects(readPlannerStream(failed.body!), { code: "ai_invalid_output", status: 503 });
  } finally { await new Promise<void>((r) => server.close(() => r())); }
});
test("SSE reader handles split UTF-8, heartbeat and incomplete results", async () => {
  const expected = { status: "needs_input", constraints, questions: ["Bạn đi mấy người?"] };
  const bytes = new TextEncoder().encode(`: keep-alive\n\ndata: ${JSON.stringify({ type: "result", data: expected })}\n\n`);
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const b of bytes) controller.enqueue(Uint8Array.of(b)); controller.close(); } });
  assert.deepEqual(await readPlannerStream(stream), expected);
  await assert.rejects(readPlannerStream(new ReadableStream({ start(c) { c.close(); } })), /incomplete/);
});

test("request validation rejects impossible dates, non-integer money and excessive input", () => {
  assert.equal(plannerRequest.safeParse({ ...input, startDate: "2030-02-30" }).success, false);
  for (const change of [{ days: 15 }, { people: 0 }, { budgetVnd: 0.5 }, { prompt: "x" }, { url: "http://example.test" }]) assert.equal(plannerRequest.safeParse({ ...input, ...change }).success, false);
});
test("planner asks for missing constraints and never guesses data", async () => {
  let loaded = false;
  const run = service([{ ...constraints, people: null, budgetVnd: null }], { catalog: async () => { loaded = true; return catalog; } });
  const result = await run(input, AbortSignal.timeout(1000));
  assert.equal(result.status, "needs_input");
  if (result.status === "needs_input") assert.equal(result.questions.length, 2);
  assert.equal(loaded, false);
  const expired = await service([{ ...constraints, startDate: "2020-01-01" }])(input, AbortSignal.timeout(1000));
  assert.equal(expired.status, "needs_input");
});
test("catalog search ignores departure city, supports accents and does not broaden empty matches", async () => {
  assert.equal(findCandidates(catalog, "da nang", 2).length, 1);
  assert.equal(findCandidates(catalog, "Hà Nội", 2).length, 0);
  assert.equal(findCandidates(catalog, "tỉnh", 2).length, 0);
  const result = await service([{ ...constraints, destination: "Phú Quốc" }])(input, AbortSignal.timeout(1000));
  assert.equal(result.status, "no_data");
});
test("grounded result resolves source text, dates and keeps unknown costs null", async () => {
  const stages: string[] = [];
  const answers: unknown[] = [{ ...constraints, people: 30 }, validSelection];
  const ai: PlannerAI = { async call(name, _description, _parameters, payload) {
    stages.push(name);
    if (name === "build_itinerary") assert.equal((payload as { constraints: Constraints }).constraints.people, 2);
    return answers.shift();
  } };
  const result = await service([], { ai })({ ...input, people: 2 }, AbortSignal.timeout(1000));
  assert.deepEqual(stages, ["search_tours", "build_itinerary"]);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.days[0].date, "2030-01-02");
  assert.equal(result.days[1].date, "2030-01-03");
  assert.equal(result.days[0].activities[0].title, "Biển Mỹ Khê");
  assert.equal(result.days[0].activities[0].costVnd, null);
  assert.equal(result.days[0].activities[0].source.tourId, id);
  assert.equal(result.budget.itineraryTotalVnd, null);
  assert.equal(result.evidence.ai, "responded");
});
test("rejects hallucinated refs, duplicates, missing days, invalid periods and repeated places", async () => {
  const refs = sourceStops(catalog.tours);
  for (const selection of [
    { days: [validSelection.days[0]] },
    { days: [{ dayNumber: 1, activities: [{ ref: "invented", period: "morning" as const }] }, validSelection.days[1]] },
    { days: [validSelection.days[0], { dayNumber: 2, activities: validSelection.days[0].activities }] },
    { days: [validSelection.days[1], validSelection.days[0]] },
    { days: [{ dayNumber: 1, activities: [] }, { dayNumber: 2, activities: [] }] },
  ]) assert.throws(() => resolveSelection(selection, constraints, refs), PlannerAIError);
  await assert.rejects(service([constraints, { days: [{ dayNumber: 1, activities: [{ ref: "t0d0s0", period: "night" }] }] }])(input, AbortSignal.timeout(1000)), PlannerAIError);
  await assert.rejects(service([{ ...constraints, days: 100 }])(input, AbortSignal.timeout(1000)), PlannerAIError);
  const copy = structuredClone(catalog.tours);
  copy[0].days[1].stops[0].title = copy[0].days[0].stops[0].title;
  assert.equal(resolveSelection(validSelection, constraints, sourceStops(copy)).length, 2);
  const sameDay = { days: [{ dayNumber: 1, activities: [...validSelection.days[0].activities, ...validSelection.days[1].activities] }, { dayNumber: 2, activities: [] }] };
  assert.throws(() => resolveSelection(sameDay, constraints, sourceStops(copy)), PlannerAIError);
});
test("unnamed meals may repeat on separate days without allowing repeated refs or attractions", () => {
  const tours = structuredClone(catalog.tours);
  tours[0].days.forEach((day) => { day.stops[0] = { ...day.stops[0], title: "Ăn tối", type: "eat", placeName: null }; });
  const refs = sourceStops(tours);
  const result = resolveSelection(validSelection, constraints, refs);
  assert.equal(result[0].activities[0].title, "Ăn tối");
  assert.equal(result[1].activities[0].title, "Ăn tối");
  assert.throws(() => resolveSelection({ days: [validSelection.days[0], { dayNumber: 2, activities: validSelection.days[0].activities }] }, constraints, refs), PlannerAIError);
  tours[0].days.forEach((day) => { day.stops[0].type = "visit"; });
  assert.equal(resolveSelection(validSelection, constraints, sourceStops(tours)).length, 2);
});
test("whole-day source repeated across periods is merged within the day", () => {
  const selection = structuredClone(validSelection);
  selection.days[0].activities.push({ ref: "t0d0s0", period: "afternoon" });
  const result = resolveSelection(selection, constraints, sourceStops(catalog.tours));
  assert.equal(result[0].activities.length, 1);
  assert.equal(result[0].activities[0].ref, "t0d0s0");
  assert.equal(result[0].activities[0].period, "morning");
});
test("nearest departures show real dates and only calculate confirmed prices", () => {
  const tours = structuredClone(catalog.tours);
  const departure = { id, startsAt: "2030-01-02T01:00:00Z", endsAt: "2030-01-03T12:00:00Z", sourcePriceVnd: "3000000", status: "open" as const, needsReview: false, priceConfirmed: true, availableSeats: 5 };
  tours[0].departures = [departure];
  assert.deepEqual(packageQuotes(tours, constraints, now)[0], { tourId: id, tourName: tours[0].name, departureId: id, startsOn: "2030-01-02", endsOn: "2030-01-03", durationDays: 2, requestedStartDate: "2030-01-02", dayDifference: 0, availableSeats: 5, perPersonVnd: "3000000", totalVnd: "6000000", withinBudget: true });
  for (const change of [{ availableSeats: 1 }, { status: "closed" as const }, { status: "full" as const }, { startsAt: "2029-12-31T01:00:00Z" }]) {
    tours[0].departures = [{ ...departure, ...change }];
    assert.equal(packageQuotes(tours, constraints, now).length, 0);
  }
  tours[0].departures = [{ ...departure, availableSeats: null, priceConfirmed: false }];
  const unknown = packageQuotes(tours, constraints, now)[0];
  assert.equal(unknown.availableSeats, null); assert.equal(unknown.perPersonVnd, null);
  assert.equal(unknown.totalVnd, null); assert.equal(unknown.withinBudget, null);
  tours[0].departures = [{ ...departure, sourcePriceVnd: "3.5" }];
  assert.equal(packageQuotes(tours, constraints, now)[0].totalVnd, null);
});
test("nearest date wins over price and accepts far dates and different tour durations", () => {
  const tours = structuredClone(catalog.tours);
  const base = { id, sourcePriceVnd: "3000000", status: "open" as const, needsReview: false, priceConfirmed: true, availableSeats: 5 };
  const dep = (day: number, price = "3000000") => ({ ...base, id: `${id}-${day}`, startsAt: `2030-01-${day}T01:00:00Z`, endsAt: `2030-01-${day + 3}T12:00:00Z`, sourcePriceVnd: price });
  tours[0].departures = [dep(20), dep(24), dep(26, "1")];
  const quotes = packageQuotes(tours, { ...constraints, startDate: "2030-01-22" }, now);
  assert.deepEqual(quotes.map((q) => q.dayDifference), [2, -2, 4]);
  assert.equal(quotes[0].startsOn, "2030-01-24");
  assert.equal(quotes[0].durationDays, 4);
  assert.equal(packageQuotes(tours, { ...constraints, startDate: "2030-12-22" }, now)[0].startsOn, "2030-01-26");
  assert.equal(packageQuotes(tours, { ...constraints, startDate: null }, now)[0].startsOn, "2030-01-20");
  tours[0].departures = [{ ...base, startsAt: "2030-01-21T18:00:00Z", endsAt: "2030-01-22T18:00:00Z" }];
  assert.equal(packageQuotes(tours, { ...constraints, startDate: "2030-01-22" }, now)[0].dayDifference, 0);
});
test("far dates and unavailable weather do not prevent planning or overwrite the requested date", async () => {
  for (const status of ["outside_forecast", "unavailable"] as const) {
    const copy = structuredClone(catalog);
    copy.tours[0].departures = [{ id, startsAt: "2030-01-20T01:00:00Z", endsAt: "2030-01-21T12:00:00Z", sourcePriceVnd: "1", status: "open", priceConfirmed: false, availableSeats: null, needsReview: true }];
    const requested = { ...constraints, startDate: "2030-01-22" };
    const result = await service([requested, validSelection], { catalog: async () => copy, weather: async () => ({ status, days: [] }) })(input, AbortSignal.timeout(1000));
    assert.equal(result.status, "ready");
    if (result.status !== "ready") continue;
    assert.equal(result.constraints.startDate, "2030-01-22");
    assert.equal(result.days[0].date, "2030-01-22");
    assert.equal(result.packageQuotes[0].startsOn, "2030-01-20");
    assert.equal(result.packageQuotes[0].dayDifference, -2);
  }
});
test("nearest tour is found across the full catalog before limiting AI candidates", async () => {
  const copy = structuredClone(catalog);
  copy.tours = Array.from({ length: 8 }, (_, index) => ({ ...structuredClone(catalog.tours[0]), id: `${id}-${index}` }));
  copy.tours[7].departures = [{ id, startsAt: "2030-01-02T01:00:00Z", endsAt: "2030-01-03T12:00:00Z", sourcePriceVnd: "1", status: "open", priceConfirmed: false, availableSeats: null, needsReview: true }];
  const result = await service([constraints, validSelection], { catalog: async () => copy })(input, AbortSignal.timeout(1000));
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.packageQuotes[0].tourId, copy.tours[7].id);
  assert.equal(result.days[0].activities[0].source.tourId, copy.tours[7].id);
  copy.tours.forEach((tour) => { tour.days = []; });
  const noItinerary = await service([constraints], { catalog: async () => copy })(input, AbortSignal.timeout(1000));
  assert.equal(noItinerary.status, "no_data");
  if (noItinerary.status === "no_data") assert.equal(noItinerary.packageQuotes.length, 1);
});
test("weather uses bounded forecast, date filters, caching and handles missing keys or errors", async () => {
  let calls = 0;
  const request = (async (url: URL) => {
    calls++; assert.equal(url.hostname, "api.weatherapi.com"); assert.equal(url.searchParams.get("days"), "3");
    return Response.json({ location: { name: "Da Nang", country: "Vietnam" }, forecast: { forecastday: ["2030-01-01", "2030-01-02", "2030-01-03"].map((date) => ({ date, day: { mintemp_c: 20, maxtemp_c: 25, daily_chance_of_rain: "80", condition: { text: "Mưa" } } })) } });
  }) as typeof fetch;
  const tool = createWeatherTool("test-only", request, () => now);
  assert.equal((await tool("Đà Nẵng", "2030-01-02", 1, AbortSignal.timeout(1000))).days.length, 1);
  assert.equal((await tool("Đà Nẵng", "2030-01-03", 1, AbortSignal.timeout(1000))).days[0].date, "2030-01-03");
  assert.equal(calls, 1);
  assert.equal((await tool("Đà Nẵng", "2030-01-04", 1, AbortSignal.timeout(1000))).status, "outside_forecast");
  assert.equal(calls, 1);
  assert.equal((await createWeatherTool("")("X", null, 1, AbortSignal.timeout(1000))).status, "not_configured");
  const bad = createWeatherTool("key", (async () => Response.json({ invalid: true })) as typeof fetch, () => now);
  assert.equal((await bad("X", "2030-01-01", 1, AbortSignal.timeout(1000))).status, "unavailable");
});
test("OpenAI-compatible adapter sends forced tools and rejects incomplete or invalid responses", async () => {
  let mode = "valid", requests = 0;
  const server = createServer(async (req, res) => {
    requests++;
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(req.url, "/v1/chat/completions"); assert.equal(body.tool_choice.function.name, "search_tours");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id: "test-response", choices: [{ finish_reason: mode === "truncated" ? "length" : "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call_test", type: "function", function: { name: mode === "wrong-tool" ? "other" : "search_tours", arguments: mode === "invalid-json" ? "{" : JSON.stringify(constraints) } }] } }] }));
  });
  server.listen(0, "127.0.0.1"); await new Promise<void>((r) => server.once("listening", r));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const ai = createPlannerAI({ baseURL: `http://127.0.0.1:${address.port}/v1`, apiKey: "test-key", model: "test-model" });
    assert.deepEqual(await ai.call("search_tours", "test", { type: "object" }, {}, AbortSignal.timeout(3000)), constraints);
    for (mode of ["truncated", "wrong-tool", "invalid-json"]) await assert.rejects(ai.call("search_tours", "test", {}, {}, AbortSignal.timeout(3000)), (e: unknown) => e instanceof PlannerAIError && e.code === "ai_invalid_output");
    await assert.rejects(createPlannerAI({ baseURL: "", apiKey: "", model: "" }).call("x", "", {}, {}, AbortSignal.timeout(100)), (e: unknown) => e instanceof PlannerAIError && e.code === "ai_unconfigured");
    assert.equal(requests, 4);
  } finally { await new Promise<void>((r) => server.close(() => r())); }
});
test("planner API enforces session, Origin, JSON and validates before spending AI tokens", async () => {
  let generated = 0;
  const app = express(); app.use(express.json());
  const auth = { async findSession() { return { id, name: "Test", email: "test@example.test", role: "USER" }; } } as unknown as AuthRepository;
  app.use("/planner", createPlannerRouter(async () => { generated++; throw new PlannerAIError("ai_unconfigured"); }, async () => auth));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((r) => server.once("listening", r));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/planner`;
  const headers = { Origin: "http://localhost:3000", "Content-Type": "application/json", Cookie: `pwy_session=${"a".repeat(64)}` };
  const post = (changes: Record<string, string>, body = input) => fetch(`${base}/generate`, { method: "POST", headers: { ...headers, ...changes }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ Cookie: "" })).status, 401);
    assert.equal((await post({ Origin: "https://attacker.test" })).status, 403);
    assert.equal((await post({ "Content-Type": "text/plain" })).status, 415);
    assert.equal((await post({}, { prompt: "x" })).status, 400);
    assert.equal(generated, 0);
    const response = await post({}); assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "ai_unconfigured" }); assert.equal(generated, 1);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { await new Promise<void>((r) => server.close(() => r())); }
});
