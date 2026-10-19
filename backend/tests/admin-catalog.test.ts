import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import express from "express";
import { createLocalAdminCatalog } from "../src/catalog/local-admin.js";
import { createAdminCatalogRouter } from "../src/catalog/admin-router.js";
import { createCatalogRouter } from "../src/catalog/router.js";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { sessionCookieName, tokenDigest } from "../src/auth/router.js";
import { env } from "../src/config/env.js";
import type { CatalogSnapshot } from "../src/catalog/contracts.js";

const category = { id: randomUUID(), name: "Tour biển", slug: "tour-bien" };
const tour = {
  id: randomUUID(),
  name: "Đà Nẵng",
  slug: "da-nang",
  category,
  departureLocation: "TP.HCM",
  durationDays: 3,
  coverImage: "https://example.test/tour.jpg",
  images: ["https://example.test/tour.jpg"],
  sourcePriceVnd: null,
  priceVnd: null,
  upcomingDepartures: 0,
  needsReview: true,
  days: [
    {
      id: randomUUID(),
      dayNumber: 1,
      title: "Ngày một",
      mealNote: "Bữa trưa",
      stops: [
        {
          id: randomUUID(),
          type: "place",
          title: "Biển",
          content: "Dạo biển",
          position: 0,
          placeName: "Biển Mỹ Khê",
        },
      ],
    },
  ],
  departures: [],
  sections: [{ id: randomUUID(), title: "Lưu ý", content: "Nội dung gốc" }],
};
const seed: CatalogSnapshot = {
  version: 1,
  generatedAt: new Date().toISOString(),
  categories: [category],
  tours: [tour],
};
async function temporary(t: import("node:test").TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "pwy-admin-test-"));
  t.after(async () => {
    const target = resolve(directory),
      root = `${resolve(tmpdir())}${sep}`;
    assert.ok(
      target.startsWith(root) && basename(target).startsWith("pwy-admin-test-"),
    );
    await rm(target, { recursive: true, force: true });
  });
  return join(directory, "catalog.json");
}

test("local admin changes persist, preserve detail and apply category visibility", async (t) => {
  const path = await temporary(t);
  const repository = createLocalAdminCatalog(path, async () => seed);
  const initial = await repository.list();
  const original = initial.tours[0];
  const { id, revision, needsReview: _review, ...input } = original;
  const saved = await repository.saveTour(
    { ...input, name: "Đà Nẵng mới" },
    id,
    revision,
  );
  assert.equal(saved.revision, 2);
  const reopened = createLocalAdminCatalog(path, async () => {
    throw new Error("must use saved state");
  });
  const visible = await reopened.publicCatalog();
  assert.equal(visible.tours[0].name, "Đà Nẵng mới");
  assert.deepEqual(visible.tours[0].days, tour.days);
  assert.deepEqual(visible.tours[0].images, tour.images);
  assert.deepEqual(visible.tours[0].sections, tour.sections);
  assert.ok(!("revision" in visible.tours[0]));
  assert.ok(!("status" in visible.categories[0]));
  await assert.rejects(repository.saveTour(input, id, revision), {
    status: 409,
    code: "stale_revision",
  });
  const hidden = await repository.saveCategory(
    { ...category, status: "inactive" },
    category.id,
    1,
  );
  assert.equal((await repository.publicCatalog()).tours.length, 0);
  assert.equal((await repository.list()).tours.length, 1);
  await repository.saveCategory(
    { name: category.name, slug: category.slug, status: "active" },
    category.id,
    hidden.revision,
  );
  assert.equal((await repository.publicCatalog()).tours.length, 1);
  await repository.saveTour(
    { ...input, status: "inactive" },
    id,
    saved.revision,
  );
  assert.equal((await repository.publicCatalog()).tours.length, 0);
});

test("new records, invalid category and concurrent edits are handled without lost writes", async (t) => {
  const path = await temporary(t);
  const repository = createLocalAdminCatalog(path, async () => seed);
  const created = await repository.saveCategory({
    name: "Tour mới",
    slug: "tour-moi",
    status: "active",
  });
  const input = {
    name: "Tour mới",
    slug: "tour-moi",
    status: "active" as const,
    categoryId: created.id,
    departureLocation: "Hà Nội",
    durationDays: null,
  };
  const saved = await repository.saveTour(input);
  const visible = (await repository.publicCatalog()).tours.find(
    (item) => item.id === saved.id,
  )!;
  assert.equal(visible.needsReview, true);
  assert.equal(visible.coverImage, null);
  assert.deepEqual(visible.days, []);
  await assert.rejects(
    repository.saveTour({ ...input, categoryId: randomUUID() }),
    { status: 400, code: "invalid_category" },
  );
  const otherProcess = createLocalAdminCatalog(path, async () => seed);
  const results = await Promise.allSettled([
    repository.saveTour({ ...input, name: "Bản A" }, saved.id, 1),
    otherProcess.saveTour({ ...input, name: "Bản B" }, saved.id, 1),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  const failed = results.find((item) => item.status === "rejected");
  assert.ok(failed && failed.status === "rejected");
  assert.equal(failed.reason.status, 409);
  assert.equal(
    (await repository.list()).tours.find((item) => item.id === saved.id)
      ?.revision,
    2,
  );
});

test("invalid stored catalog fails closed instead of overwriting saved work", async (t) => {
  const path = await temporary(t);
  await writeFile(path, "broken-json");
  const repository = createLocalAdminCatalog(path, async () => seed);
  await assert.rejects(repository.publicCatalog());
  await assert.rejects(
    repository.saveCategory({ name: "Test", slug: "test", status: "inactive" }),
  );
  assert.equal(await readFile(path, "utf8"), "broken-json");
});

test("admin API checks real sessions, role, origin, validation and public visibility", async (t) => {
  const path = await temporary(t);
  const repository = createLocalAdminCatalog(path, async () => seed);
  const auth = await createLocalAuthRepository();
  const userId = randomUUID(),
    token = "a".repeat(64);
  await auth.register(
    {
      id: userId,
      name: "Test",
      email: "admin@example.test",
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
  const cookie = `${sessionCookieName}=${token}`;
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
  const base = `http://127.0.0.1:${address.port}`;
  const mutate = (
    route: string,
    input: unknown,
    origin: string | null = new URL(env.CLIENT_ORIGIN).origin,
    method = "POST",
    session = cookie,
  ) =>
    fetch(`${base}/admin/${route}`, {
      method,
      headers: {
        Cookie: session,
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify(input),
    });
  try {
    assert.equal((await fetch(`${base}/admin/catalog`)).status, 401);
    assert.equal((await mutate("categories", {})).status, 403);
    await auth.promoteAdmin("admin@example.test");
    const list = await fetch(`${base}/admin/catalog`, {
      headers: { Cookie: cookie },
    });
    assert.equal(list.status, 200);
    assert.equal(list.headers.get("cache-control"), "no-store");
    assert.ok(!(await list.text()).includes("passwordHash"));
    const input = { name: "Tour mới", slug: "tour-moi", status: "active" };
    assert.equal((await mutate("categories", input, null)).status, 403);
    assert.equal(
      (await mutate("categories", input, "https://untrusted.test")).status,
      403,
    );
    assert.equal(
      (
        await mutate(
          "categories",
          input,
          undefined,
          "POST",
          `${cookie}; ${cookie}`,
        )
      ).status,
      401,
    );
    for (const extra of [
      { role: "ADMIN" },
      { revision: 99 },
      { sourceDatabase: "fake" },
    ])
      assert.equal(
        (await mutate("categories", { ...input, ...extra })).status,
        400,
      );
    assert.equal(
      (await mutate("categories", { ...input, slug: "Invalid slug" })).status,
      400,
    );
    const created = await mutate("categories", input);
    assert.equal(created.status, 201);
    const saved = (await created.json()).data;
    const tourInput = {
      ...input,
      categoryId: saved.id,
      departureLocation: "TP.HCM",
      durationDays: 3,
    };
    assert.equal(
      (await mutate("tours", { ...tourInput, needsReview: false })).status,
      400,
    );
    const createdTour = await mutate("tours", tourInput);
    assert.equal(createdTour.status, 201);
    const savedTour = (await createdTour.json()).data;
    assert.equal(
      (await fetch(`${base}/explore/tours/${savedTour.id}`)).status,
      200,
    );
    assert.equal(
      (
        await mutate(
          `categories/${saved.id}`,
          { ...input, status: "inactive", revision: 1 },
          undefined,
          "PATCH",
        )
      ).status,
      200,
    );
    assert.equal(
      (await fetch(`${base}/explore/tours/${savedTour.id}`)).status,
      404,
    );
    assert.equal(
      (
        await mutate(
          `categories/${saved.id}`,
          { ...input, revision: 1 },
          undefined,
          "PATCH",
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await mutate(
          "categories/not-uuid",
          { ...input, revision: 1 },
          undefined,
          "PATCH",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(
          `categories/${randomUUID()}`,
          { ...input, revision: 1 },
          undefined,
          "PATCH",
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${base}/admin/categories`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: new URL(env.CLIENT_ORIGIN).origin,
            "Content-Type": "text/plain",
          },
          body: "test",
        })
      ).status,
      415,
    );
    await auth.deleteSession(tokenDigest(token));
    assert.equal(
      (await fetch(`${base}/admin/catalog`, { headers: { Cookie: cookie } }))
        .status,
      401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await auth.close();
  }
});
