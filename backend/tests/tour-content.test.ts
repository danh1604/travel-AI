import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import express from "express";
import { createLocalAdminCatalog } from "../src/catalog/local-admin.js";
import { tourContentInput } from "../src/catalog/content-contracts.js";
import { createAdminCatalogRouter } from "../src/catalog/admin-router.js";
import { createCatalogRouter } from "../src/catalog/router.js";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { sessionCookieName, tokenDigest } from "../src/auth/router.js";
import { env } from "../src/config/env.js";
import { buildMappingPlan } from "../src/legacy/mapping.js";
import { projectCatalog } from "../src/catalog/project.js";
import type { CatalogSnapshot } from "../src/catalog/contracts.js";

function fixture(): CatalogSnapshot {
  const category = { id: randomUUID(), name: "Biển", slug: "bien" };
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    categories: [category],
    tours: [0, 1].map((index) => ({
      id: randomUUID(),
      name: `Tour ${index}`,
      slug: `tour-${index}`,
      category,
      departureLocation: "TP.HCM",
      durationDays: 3,
      coverImage: "https://example.test/old.jpg",
      images: ["https://example.test/old.jpg"],
      sourcePriceVnd: null,
      priceVnd: null,
      upcomingDepartures: 0,
      needsReview: true,
      days: [0, 1].map((number) => ({
        id: randomUUID(),
        dayNumber: number + 1,
        title: `Ngày ${number + 1}`,
        mealNote: null,
        stops: [
          {
            id: randomUUID(),
            position: 0,
            type: "visit",
            title: "Tham quan",
            content: "Nội dung cũ",
            placeName: "Đà Nẵng",
          },
        ],
      })),
      departures: [],
      sections: [{ id: randomUUID(), title: "Ghi chú", content: "Giữ nguyên" }],
    })),
  };
}
async function setup(t: import("node:test").TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "pwy-content-test-"));
  t.after(async () => {
    const target = resolve(directory);
    assert.ok(
      target.startsWith(`${resolve(tmpdir())}${sep}`) &&
        basename(target).startsWith("pwy-content-test-"),
    );
    await rm(target, { recursive: true, force: true });
  });
  const path = join(directory, "catalog.json"),
    seed = fixture();
  return {
    path,
    seed,
    repository: createLocalAdminCatalog(path, async () => seed),
  };
}

test("content validation rejects unsafe URLs, duplicate IDs and extra fields", () => {
  const valid = {
    revision: 1,
    images: ["https://example.test/a.jpg"],
    days: [],
  };
  assert.equal(tourContentInput.safeParse(valid).success, true);
  for (const url of [
    "bad-url",
    "http://example.test/a.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,aaa",
    "https://user:password@example.test/a.jpg",
  ]) {
    assert.equal(
      tourContentInput.safeParse({ ...valid, images: [url] }).success,
      false,
      url,
    );
  }
  for (const value of [
    { ...valid, revision: 0 },
    { ...valid, needsReview: false },
    { ...valid, images: [...valid.images, ...valid.images] },
    {
      ...valid,
      images: Array.from({ length: 41 }, (_, i) => `https://example.test/${i}`),
    },
  ]) {
    assert.equal(tourContentInput.safeParse(value).success, false);
  }
  const stop = {
    id: randomUUID(),
    type: "visit",
    title: "Tham quan",
    content: "",
    placeName: null,
  };
  const day = {
    id: randomUUID(),
    title: "Ngày một",
    mealNote: null,
    stops: [stop],
  };
  for (const days of [
    [day, day],
    [{ ...day, stops: [stop, stop] }],
    [{ ...day, stops: [{ ...stop, placeId: randomUUID() }] }],
    [{ ...day, title: " " }],
  ]) {
    assert.equal(tourContentInput.safeParse({ ...valid, days }).success, false);
  }
});

test("content edits persist, reorder children, change cover and preserve unrelated data", async (t) => {
  const { path, seed, repository } = await setup(t),
    id = seed.tours[0].id;
  const before = await repository.getContent(id);
  const edited = tourContentInput.parse({
    revision: before.revision,
    images: ["https://example.test/new.jpg", ...before.images],
    days: [
      {
        ...before.days[1],
        title: "Đà Nẵng ngày đầu",
        mealNote: "Ăn sáng",
        stops: [
          {
            ...before.days[0].stops[0],
            placeName: "Hội An",
            content: "Dòng một\nDòng hai",
          },
          {
            type: "visit",
            title: "Hoạt động mới",
            content: "",
            placeName: null,
          },
        ],
      },
      { title: "Ngày mới", mealNote: null, stops: [before.days[1].stops[0]] },
    ],
  });
  const saved = await repository.saveContent(id, edited);
  assert.equal(saved.revision, 2);
  assert.equal(saved.days[0].id, before.days[1].id);
  assert.equal(saved.days[0].stops[0].id, before.days[0].stops[0].id);
  assert.ok(saved.days[0].stops[1].id);
  assert.ok(saved.days[1].id);
  const reopened = createLocalAdminCatalog(path, async () => {
    throw new Error("must read persisted file");
  });
  assert.deepEqual(await reopened.getContent(id), saved);
  const tour = (await reopened.publicCatalog()).tours.find(
    (item) => item.id === id,
  )!;
  assert.equal(tour.coverImage, edited.images[0]);
  assert.equal(tour.images[1], before.images[0]);
  assert.deepEqual(
    tour.days.map((day) => day.dayNumber),
    [1, 2],
  );
  assert.deepEqual(
    tour.days[0].stops.map((stop) => stop.position),
    [0, 1],
  );
  assert.equal(tour.days[0].stops[0].placeName, "Hội An");
  assert.equal(tour.durationDays, 3);
  assert.deepEqual(tour.sections, seed.tours[0].sections);
  assert.deepEqual(tour.departures, seed.tours[0].departures);
  assert.deepEqual((await reopened.publicCatalog()).tours[1], seed.tours[1]);
  await repository.saveContent(id, {
    revision: saved.revision,
    images: [],
    days: [],
  });
  const cleared = (await reopened.publicCatalog()).tours[0];
  assert.equal(cleared.coverImage, null);
  assert.deepEqual(cleared.images, []);
  assert.deepEqual(cleared.days, []);
});

test("metadata and content share revisions; foreign children fail without partial changes", async (t) => {
  const { path, seed, repository } = await setup(t),
    id = seed.tours[0].id;
  const before = await repository.getContent(id);
  const metadata = (await repository.list()).tours[0];
  const {
    id: _id,
    revision: _revision,
    needsReview: _review,
    ...input
  } = metadata;
  await repository.saveTour({ ...input, name: "Tên mới" }, id, 1);
  await assert.rejects(
    repository.saveContent(id, {
      revision: 1,
      images: before.images,
      days: before.days,
    }),
    { status: 409 },
  );
  const bytes = await readFile(path, "utf8"),
    foreign = (await repository.getContent(seed.tours[1].id)).days[0];
  for (const days of [
    [foreign],
    [{ ...before.days[0], stops: foreign.stops }],
  ]) {
    await assert.rejects(
      repository.saveContent(id, { revision: 2, images: [], days }),
      { status: 400, code: "invalid_child" },
    );
    assert.equal(await readFile(path, "utf8"), bytes);
  }
  await repository.saveContent(id, {
    revision: 2,
    images: [],
    days: before.days,
  });
  await assert.rejects(repository.saveTour(input, id, 2), { status: 409 });
  await assert.rejects(repository.getContent(randomUUID()), { status: 404 });
});

test("public projection honors image order, archived children and place labels", () => {
  const categoryId = "1".repeat(24),
    tourId = "2".repeat(24),
    dayId = "3".repeat(24);
  const plan = buildMappingPlan("test", {
    categories: [
      { _id: categoryId, name: "Biển", slug: "bien", status: "active" },
    ],
    tours: [
      {
        _id: tourId,
        name: "Tour",
        slug: "tour",
        category_id: categoryId,
        status: "active",
        start_location: "TP.HCM",
        duration: 3,
      },
    ],
    itineraries: [
      { _id: dayId, tour_id: tourId, day_number: 1, title: "Ngày một" },
    ],
  });
  const canonicalTour = plan.tours[0],
    canonicalDay = plan.days[0];
  assert.ok(canonicalDay);
  plan.images.push(
    ...[0, 1, 2].map((index) => ({
      id: randomUUID(),
      sourceDatabase: "test",
      sourceId: String(index),
      sourceCollection: "tour_images",
      tourId: canonicalTour.id,
      url: `https://example.test/${index}`,
      position: 2 - index,
      isHidden: index === 1,
    })),
  );
  plan.stops.push(
    ...[0, 1].map((index) => ({
      id: randomUUID(),
      sourceDatabase: "test",
      sourceId: String(index),
      dayId: canonicalDay.id,
      type: "visit",
      title: "Hoạt động",
      content: "",
      position: index,
      placeLabel: "Địa điểm mới",
      isHidden: index === 1,
    })),
  );
  const result = projectCatalog(plan).tours[0];
  assert.deepEqual(result.images, [
    "https://example.test/2",
    "https://example.test/0",
  ]);
  assert.equal(result.days[0].stops.length, 1);
  assert.equal(result.days[0].stops[0].placeName, "Địa điểm mới");
  plan.days[0].isHidden = true;
  assert.deepEqual(projectCatalog(plan).tours[0].days, []);
});

test("content routes enforce Admin, Origin, child ownership and public updates", async (t) => {
  const { seed, repository } = await setup(t),
    id = seed.tours[0].id;
  const auth = await createLocalAuthRepository(),
    userId = randomUUID(),
    token = "b".repeat(64);
  await auth.register(
    {
      id: userId,
      name: "Test",
      email: "content@example.test",
      role: "USER",
      passwordHash: "test-only",
    },
    {
      id: randomUUID(),
      userId,
      tokenHash: tokenDigest(token),
      expiresAt: new Date(Date.now() + 60_000),
    },
  );
  const cookie = `${sessionCookieName}=${token}`,
    origin = new URL(env.CLIENT_ORIGIN).origin;
  const app = express();
  app.use(express.json());
  app.use(
    "/admin",
    createAdminCatalogRouter(
      () => repository,
      async () => auth,
    ),
  );
  app.use(
    "/explore",
    createCatalogRouter(() => repository.publicCatalog()),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`,
    path = `/admin/tours/${id}/content`;
  const put = (
    body: unknown,
    source: string | null = origin,
    session = cookie,
  ) =>
    fetch(`${base}${path}`, {
      method: "PUT",
      headers: {
        Cookie: session,
        "Content-Type": "application/json",
        ...(source ? { Origin: source } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(`${base}${path}`)).status, 401);
    assert.equal((await put({}, origin, "")).status, 401);
    assert.equal((await put({})).status, 403);
    await auth.promoteAdmin("content@example.test");
    const response = await fetch(`${base}${path}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const initial = (await response.json()).data;
    const body = {
      revision: initial.revision,
      images: ["https://example.test/cover.jpg"],
      days: initial.days,
    };
    assert.equal((await put(body, null)).status, 403);
    assert.equal((await put(body, "https://untrusted.test")).status, 403);
    assert.equal((await put({ ...body, images: ["bad-url"] })).status, 400);
    assert.equal(
      (await put({ ...body, days: [body.days[0], body.days[0]] })).status,
      400,
    );
    assert.equal((await put({ ...body, needsReview: false })).status, 400);
    assert.equal(
      (
        await put({
          ...body,
          days: [{ ...body.days[0], id: seed.tours[1].days[0].id }],
        })
      ).status,
      400,
    );
    const saved = await put(body);
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).data.revision, 2);
    assert.equal((await put(body)).status, 409);
    const visible = (await (await fetch(`${base}/explore/tours/${id}`)).json())
      .data;
    assert.equal(visible.coverImage, body.images[0]);
    assert.deepEqual(visible.days[0].stops[0].placeName, "Đà Nẵng");
    assert.ok(!("revision" in visible));
    const metadata = (await repository.list()).tours[0];
    await repository.saveTour(
      {
        name: metadata.name,
        slug: metadata.slug,
        status: "inactive",
        categoryId: metadata.categoryId,
        durationDays: metadata.durationDays,
        departureLocation: metadata.departureLocation,
      },
      id,
      2,
    );
    assert.equal(
      (await fetch(`${base}${path}`, { headers: { Cookie: cookie } })).status,
      200,
    );
    assert.equal((await fetch(`${base}/explore/tours/${id}`)).status, 404);
    for (const invalid of ["not-a-uuid", randomUUID()])
      assert.equal(
        (
          await fetch(`${base}/admin/tours/${invalid}/content`, {
            headers: { Cookie: cookie },
          })
        ).status,
        invalid === "not-a-uuid" ? 400 : 404,
      );
    await auth.deleteSession(tokenDigest(token));
    assert.equal((await put(body)).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await auth.close();
  }
});
