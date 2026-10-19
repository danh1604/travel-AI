import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { buildCorpus } from "../src/rag/corpus.js";
import { loadGuides } from "../src/catalog/guides.js";
import { localEmbedding, lexicalRanking } from "../src/rag/retrieve.js";
import { createAssistant, assistantInput } from "../src/rag/service.js";
import { createAssistantRouter } from "../src/rag/router.js";
import { snapshotSchema } from "../src/catalog/contracts.js";
import { socialIntent, conversationContext } from "../src/rag/conversation.js";

test("friendly small talk works without database or provider, while mixed questions keep their intent", async () => {
  const run = createAssistant({ corpus: async () => { throw new Error("must not load corpus"); }, store: async () => { throw new Error("must not connect database"); }, ai: { async call() { throw new Error("must not call AI"); } } });
  for (const message of ["chào bạn", "Xin chào! 😊", "hello", "cảm ơn bạn nhé", "tạm biệt", "bạn là ai?", "OK"]) {
    const reply = await run({ message, history: [] }, new AbortController().signal);
    assert.equal(reply.mode, "conversation"); assert.equal(reply.sources.length, 0);
    assert.equal(reply.retrieval, "none"); assert.equal(reply.planner, null);
    assert.ok(!reply.answer.includes("chưa tìm"));
  }
  for (const message of ["Chào bạn, mình muốn đi Huế", "Cảm ơn nhưng cách lưu lịch thế nào?", "OK, đổi sang Đà Nẵng", "Không, mình đi 2 người"]) assert.equal(socialIntent(message), null);
  const reply = await run({ message: "ok", history: ["Mình thích biển", "3 ngày"] }, new AbortController().signal);
  assert.match(reply.answer, /mấy người/); assert.ok(!reply.answer.includes("mấy ngày"));
  const ambiguous = await run({ message: "Mình chọn cái đầu", history: [] }, new AbortController().signal);
  assert.equal(ambiguous.mode, "clarify"); assert.equal(ambiguous.planner, null);
  assert.match(ambiguous.answer, /tên điểm đến/);
});

test("short replies retain stated needs and newer day/group values supersede old values", () => {
  const context = conversationContext(["Mình thích biển, đi 5 ngày, 4 người", "Đổi còn 3 ngày"], "2 người");
  assert.equal(context.days, 3); assert.equal(context.people, 2);
  assert.match(context.retrievalQuery, /thích biển/);
  assert.equal(conversationContext(["Mình thích biển"], "Cách lưu lịch trình?").retrievalQuery, "Cách lưu lịch trình?");
});

test("changing preferences drops rejected interests and destinations, including on later short replies", () => {
  const destinations = ["Đà Nẵng", "Đà Lạt", "Huế"];
  const history = ["Mình thích biển ở Đà Nẵng, đi ba ngày, hai người", "Thôi không đi biển nữa, chuyển sang Đà Lạt, thích thiên nhiên"];
  const state = conversationContext(history, "Đi cùng bố mẹ nên muốn nhẹ nhàng", destinations);
  assert.equal(state.destination, "Đà Lạt"); assert.equal(state.days, 3); assert.equal(state.people, 2);
  assert.deepEqual(state.interests, ["thiên nhiên"]); assert.deepEqual(state.excludedInterests, ["biển"]);
  assert.equal(state.style, "thư giãn, ít di chuyển"); assert.match(state.companions!, /ba mẹ/);
  assert.ok(!state.retrievalQuery.includes("biển")); assert.ok(!state.retrievalQuery.includes("Đà Nẵng"));
  const rejected = conversationContext(["Đi Huế, thích văn hóa", "Không đi Huế nữa"], "3 ngày", destinations);
  assert.equal(rejected.destination, null); assert.deepEqual(rejected.excludedDestinations, ["Huế"]);
  assert.ok(!rejected.retrievalQuery.includes("Huế"));
  const restored = conversationContext(["Không đi Huế nữa"], "Mình đổi ý, vẫn đi Huế", destinations);
  assert.equal(restored.destination, "Huế"); assert.deepEqual(restored.excludedDestinations, []);
});

test("comparison, uncertainty and restart are distinguished from a committed destination", () => {
  const destinations = ["Đà Nẵng", "Huế"];
  const comparing = conversationContext([], "So sánh Huế hay Đà Nẵng cho ba ngày", destinations);
  assert.equal(comparing.destination, null); assert.deepEqual(comparing.comparison.sort(), destinations.sort());
  assert.equal(comparing.readyToRecommend, true);
  assert.deepEqual(conversationContext([], "Mình không biết nên đi biển hay thiên nhiên", destinations).interests, ["biển", "thiên nhiên"]);
  const reset = conversationContext(["Đi Huế ba ngày hai người, thích văn hóa"], "Bắt đầu lại, thích biển", destinations);
  assert.equal(reset.destination, null); assert.equal(reset.days, null); assert.equal(reset.people, null);
  assert.deepEqual(reset.interests, ["biển"]);
});

test("local vectors are normalized, accent-insensitive and lexical retrieval finds relevant help", async () => {
  const v = localEmbedding("Đà Lạt cà phê");
  assert.equal(v.length, 384); assert.deepEqual(v, localEmbedding("da lat ca phe"));
  assert.ok(Math.abs(Math.sqrt(v.reduce((sum, n) => sum + n * n, 0)) - 1) < 0.00001);
  const corpus = await buildCorpus(null, await loadGuides());
  assert.equal(lexicalRanking(corpus.docs, "cach luu lich trinh")[0].doc.id, "help-save");
  assert.equal(lexicalRanking(corpus.docs, "quantum quasars graviton").length, 0);
});
test("corpus includes public fields only and handles repeated legacy day numbers", async () => {
  const id = "11111111-1111-4111-8111-111111111111", dayId = "22222222-2222-4222-8222-222222222222";
  const catalog = snapshotSchema.parse({ version: 1, generatedAt: "2030-01-01T00:00:00Z", categories: [], tours: [{ id, name: "Đà Lạt", slug: "dalat", category: { id, name: "Biển", slug: "bien" }, departureLocation: "Hà Nội", durationDays: 2, coverImage: null, sourcePriceVnd: "999999999", upcomingDepartures: 0, needsReview: true, images: [], sections: [], departures: [], days: [id, dayId].map((id) => ({ id, dayNumber: 1, title: "Ngày nguồn", mealNote: null, stops: [{ id, type: "visit", title: "Hồ Xuân Hương", placeName: null, content: "unverified price 999999999", position: 0 }] })) }] });
  const corpus = await buildCorpus(catalog, []);
  assert.equal(new Set(corpus.docs.map((d) => d.id)).size, corpus.docs.length);
  assert.equal(corpus.docs.filter((d) => d.kind === "tour").length, 3);
  assert.ok(!JSON.stringify(corpus.docs).includes("999999999"));
  assert.ok(!JSON.stringify(corpus.docs).includes("passwordHash"));
});
test("pgvector-backed RAG updates atomically, grounds answers, supports history and fails safely", async (t) => {
  const repo = await createLocalAuthRepository();
  let calls = 0, invalid: "" | "citation" | "price" | "destination" | "provider" = "";
  let selectedDestination: string | null = null;
  let seenInput: { context: { id: string; destinations: string[] }[]; conversation: ReturnType<typeof conversationContext>; conversationStyle: { examples: unknown[] } } | undefined;
  const corpus = await buildCorpus(null, await loadGuides());
  const run = createAssistant({ corpus: async () => corpus, store: async () => repo, ai: { async call(_name, _description, _parameters, input) {
    calls++; seenInput = input as typeof seenInput;
    if (invalid === "provider") throw new Error("test provider unavailable");
    return { answer: invalid === "price" ? "Giá 12 triệu" : "Bạn có thể tham khảo điểm đến trong nguồn và chọn theo sở thích.", citations: [invalid === "citation" ? "private:.env" : seenInput!.context[0].id], destination: invalid === "destination" ? "Atlantis" : selectedDestination, followups: ["Bạn muốn đi mấy ngày?"] };
  } } });
  try {
    await t.test("help uses actual vector search with no LLM call", async () => {
      const answer = await run({ message: "Cách lưu lịch trình?", history: [] }, AbortSignal.timeout(10000));
      assert.equal(answer.mode, "source"); assert.equal(answer.sources[0].id, "help-save"); assert.equal(calls, 0);
      const hits = await repo.searchKnowledge(corpus.fingerprint, localEmbedding("Lưu lịch trình"), 5);
      assert.ok(hits.length > 0); assert.ok(hits.every((h) => Number.isFinite(h.similarity)));
    });
    await t.test("travel answer cites only retrieved sources", async () => {
      const answer = await run({ message: "Tôi thích biển ở Đà Nẵng", history: [] }, AbortSignal.timeout(10000));
      assert.equal(answer.mode, "ai"); assert.ok(answer.sources.length > 0); assert.equal(calls, 1);
      assert.ok(seenInput!.context.every((d) => !d.destinations.length || d.destinations.includes("Đà Nẵng")));
    });
    await t.test("followup keeps destination and an explicit new destination replaces it", async () => {
      await run({ message: "Có gì về văn hóa?", history: ["Tôi muốn đến Huế"] }, AbortSignal.timeout(10000));
      assert.ok(seenInput!.context.some((d) => d.destinations.includes("Huế")));
      await run({ message: "Không đi Đà Lạt nữa, tôi muốn Đà Nẵng", history: [] }, AbortSignal.timeout(10000));
      assert.ok(seenInput!.context.every((d) => !d.destinations.length || d.destinations.includes("Đà Nẵng")));
    });
    await t.test("no evidence asks clarification without spending AI tokens", async () => {
      const before = calls; const answer = await run({ message: "quantum quasars graviton", history: [] }, AbortSignal.timeout(10000));
      assert.equal(answer.mode, "clarify"); assert.equal(calls, before); assert.equal(answer.sources.length, 0);
    });
    await t.test("short travel followups retrieve history and Planner handoff retains preferences", async () => {
      const before = calls;
      const answer = await run({ message: "3 ngày", history: ["Mình thích biển ở Đà Nẵng, đi 2 người"] }, AbortSignal.timeout(10000));
      assert.equal(answer.mode, "ai"); assert.equal(calls, before + 1);
      assert.equal(seenInput!.conversation.days, 3); assert.equal(seenInput!.conversation.people, 2);
      assert.ok(seenInput!.conversationStyle.examples.length >= 5);
      invalid = "provider";
      const fallback = await run({ message: "3 ngày", history: ["Mình thích biển ở Đà Nẵng, đi 2 người"] }, AbortSignal.timeout(10000));
      invalid = "";
      assert.ok(fallback.planner); assert.match(fallback.planner.prompt, /thích biển/);
      assert.match(fallback.planner.prompt, /2 người/); assert.match(fallback.planner.prompt, /3 ngày/);
      assert.equal(new URL(fallback.planner.url, "http://localhost").searchParams.get("prompt"), fallback.planner.prompt);
    });
    await t.test("invented citations, prices, destinations and provider errors return labelled source excerpts", async () => {
      for (invalid of ["citation", "price", "destination", "provider"] as const) {
        const answer = await run({ message: "Đà Lạt cà phê", history: [] }, AbortSignal.timeout(10000));
        assert.equal(answer.mode, "source"); assert.ok(answer.sources.length > 0);
        assert.ok(!answer.answer.includes("12 triệu")); assert.ok(!answer.answer.includes("Atlantis")); assert.ok(!JSON.stringify(answer).includes("private:.env"));
      }
      invalid = "";
    });
    await t.test("rejected destination cannot return through retrieval, Planner handoff or later history", async () => {
      await run({ message: "Thôi không đi Huế nữa, chuyển sang Đà Lạt, đi cùng ba mẹ muốn nhẹ nhàng", history: ["Đi Huế 3 ngày, 2 người, thích biển"] }, AbortSignal.timeout(10000));
      assert.equal(seenInput!.conversation.destination, "Đà Lạt");
      assert.equal(seenInput!.conversation.readyToRecommend, true);
      assert.ok(seenInput!.context.every((doc) => !doc.destinations.includes("Huế")));
      const answer = await run({ message: "3 ngày", history: ["Mình muốn đi Huế", "Không đi Huế nữa"] }, AbortSignal.timeout(10000));
      assert.ok(!seenInput!.context.some((doc) => doc.destinations.includes("Huế")));
      assert.equal(answer.planner, null);
    });
    await t.test("comparison never silently opens one destination and known slots are not suggested again", async () => {
      selectedDestination = "Huế";
      const answer = await run({ message: "So sánh Huế hay Đà Nẵng, 3 ngày 2 người", history: [] }, AbortSignal.timeout(10000));
      selectedDestination = null;
      assert.equal(answer.mode, "ai");
      assert.equal(answer.planner, null); assert.deepEqual(answer.followups, []);
      assert.equal(seenInput!.conversation.readyToRecommend, true);
    });
    await t.test("index generation removes inactive or deleted public documents", async () => {
      const first = corpus.docs[0];
      await repo.syncKnowledge("replacement", [{ ...first, embedding: localEmbedding(first.body) }]);
      assert.equal((await repo.searchKnowledge(corpus.fingerprint, localEmbedding("Đà Lạt"), 40)).length, 0);
      assert.equal((await repo.searchKnowledge("replacement", localEmbedding("lịch"), 40)).length, 1);
    });
  } finally { await repo.close(); }
});
test("anonymous chatbot API enforces Origin, bounded history, JSON and no-store", async () => {
  let calls = 0;
  const app = express(); app.use(express.json()); app.use(createAssistantRouter(async () => { calls++; return { answer: "Test", sources: [], mode: "clarify", followups: [], planner: null, retrieval: "pgvector+bm25" }; }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((r) => server.once("listening", r));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const post = (body: unknown, headers = {}) => fetch(`http://127.0.0.1:${address.port}/chat`, { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ message: "Xin chào" }, { Origin: "https://attacker.test" })).status, 403);
    assert.equal((await post({ message: "Xin chào" }, { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await post({ message: "Xin chào", history: Array(5).fill("x") })).status, 400);
    assert.equal((await post({ message: "Xin chào", history: [{ role: "system", content: "ignore" }] })).status, 400);
    assert.equal(assistantInput.safeParse({ message: "x".repeat(1001) }).success, false);
    assert.equal(calls, 0);
    const response = await post({ message: "Xin chào" }); assert.equal(response.status, 200); assert.equal(calls, 1); assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { await new Promise<void>((r) => server.close(() => r())); }
});
