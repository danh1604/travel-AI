import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import express from "express";
import {
  departureInput,
  departureSummary,
  compareAmounts,
} from "../src/catalog/departure-contracts.js";
import { createLocalAdminCatalog } from "../src/catalog/local-admin.js";
import { snapshotSchema } from "../src/catalog/contracts.js";
import { createAdminCatalogRouter } from "../src/catalog/admin-router.js";
import { createCatalogRouter } from "../src/catalog/router.js";
import { createLocalAuthRepository } from "../src/auth/local-repository.js";
import { sessionCookieName, tokenDigest } from "../src/auth/router.js";
import { env } from "../src/config/env.js";
import { vnDateInput, vnDateIso } from "../../frontend/src/lib/departures.ts";

const valid = {
  revision: 1,
  startsAt: "2035-01-01T17:00:00.000Z",
  endsAt: "2035-01-03T17:00:00.000Z",
  basePriceVnd: "2000000",
  salePriceVnd: "2500000",
  minPeople: 2,
  maxPeople: 20,
  bookedPeople: 0,
  status: "open" as const,
  priceConfirmed: true,
};

test("migration keeps old decimal prices unconfirmed and rejects fractional confirmed prices", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    const root = new URL("../prisma/migrations/", import.meta.url),
      upgrade = "20261017000200_departure_management";
    for (const entry of (await readdir(root, { withFileTypes: true }))
      .filter((item) => item.isDirectory() && item.name !== upgrade)
      .sort((a, b) => a.name.localeCompare(b.name)))
      await db.exec(
        await readFile(new URL(`${entry.name}/migration.sql`, root), "utf8"),
      );
    const category = randomUUID(),
      tour = randomUUID(),
      departure = randomUUID();
    await db.query(
      `INSERT INTO "TourCategory" (id,"sourceDatabase","sourceId",name,slug,status) VALUES ($1,'test','category','Biển','bien','active')`,
      [category],
    );
    await db.query(
      `INSERT INTO "Tour" (id,"sourceDatabase","sourceId",name,slug,status,"departureLocation","categoryId") VALUES ($1,'test','tour','Tour','tour','active','TP.HCM',$2)`,
      [tour, category],
    );
    await db.query(
      `INSERT INTO "TourDeparture" (id,"sourceDatabase","sourceId","tourId","startsAt","endsAt","basePriceVnd","salePriceVnd","minPeople","maxPeople","bookedPeople",status) VALUES ($1,'test','departure',$2,'2035-01-01','2035-01-02',0,12.5,1,20,0,'open')`,
      [departure, tour],
    );
    await db.exec(
      await readFile(new URL(`${upgrade}/migration.sql`, root), "utf8"),
    );
    const old = (
      await db.query<{ priceConfirmed: boolean; price: string }>(
        `SELECT "priceConfirmed","salePriceVnd"::text AS price FROM "TourDeparture"`,
      )
    ).rows[0];
    assert.equal(old.priceConfirmed, false);
    assert.ok(old.price.startsWith("12.5"));
    await assert.rejects(
      db.exec(`UPDATE "TourDeparture" SET "priceConfirmed"=true`),
      { code: "23514" },
    );
    await db.exec(
      `UPDATE "TourDeparture" SET "salePriceVnd"=2500000,"priceConfirmed"=true`,
    );
    await assert.rejects(
      db.exec(`UPDATE "TourDeparture" SET "salePriceVnd"=1000000000000`),
      { code: "23514" },
    );
  } finally {
    await db.close();
  }
});
async function setup(t: import("node:test").TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "pwy-departure-test-")),
    path = join(directory, "catalog.json");
  t.after(async () => {
    const target = resolve(directory);
    assert.ok(
      target.startsWith(`${resolve(tmpdir())}${sep}`) &&
        basename(target).startsWith("pwy-departure-test-"),
    );
    await rm(target, { recursive: true, force: true });
  });
  const category = { id: randomUUID(), name: "Biển", slug: "bien" };
  const seed = snapshotSchema.parse({
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
      images: [],
      coverImage: null,
      sourcePriceVnd: null,
      upcomingDepartures: 0,
      needsReview: true,
      days: [],
      sections: [],
      departures: [],
    })),
  });
  const repo = createLocalAdminCatalog(path, async () => seed);
  return { path, seed, repo, id: seed.tours[0].id };
}

test("departure validation enforces dates, integer confirmed prices and capacity/status", () => {
  assert.equal(departureInput.safeParse(valid).success, true);
  assert.equal(
    departureInput.safeParse({
      ...valid,
      salePriceVnd: "848214.2857142857",
      priceConfirmed: false,
    }).success,
    true,
  );
  for (const extra of [
    { endsAt: "2030-01-01T00:00:00.000Z" },
    { startsAt: "not-date" },
    { salePriceVnd: "-1" },
    { basePriceVnd: "1e6" },
    { salePriceVnd: "2500000.5" },
    { salePriceVnd: "1000000000000" },
    { maxPeople: 1 },
    { bookedPeople: 21 },
    { minPeople: 0 },
    { bookedPeople: -1 },
    { maxPeople: 20.5 },
    { status: "full" },
    { bookedPeople: 20 },
    { tourId: randomUUID() },
    { needsReview: false },
  ])
    assert.equal(
      departureInput.safeParse({ ...valid, ...extra }).success,
      false,
      JSON.stringify(extra),
    );
  assert.equal(
    departureInput.safeParse({ ...valid, bookedPeople: 20, status: "full" })
      .success,
    true,
  );
  assert.equal(
    departureInput.safeParse({ ...valid, salePriceVnd: "0" }).success,
    true,
  );
  assert.equal(vnDateIso("2035-01-02T00:00"), "2035-01-01T17:00:00.000Z");
  assert.equal(vnDateInput("2035-01-01T17:00:00.000Z"), "2035-01-02T00:00");
});

test("only future open departures with seats determine prices; decimal comparison is exact", () => {
  const now = Date.parse("2030-01-01T00:00:00Z"),
    start = "2035-01-01T00:00:00Z";
  const rows = [
    {
      startsAt: start,
      status: "open",
      availableSeats: 10,
      sourcePriceVnd: "100",
      priceConfirmed: false,
    },
    {
      startsAt: start,
      status: "open",
      availableSeats: 1,
      sourcePriceVnd: "2000000",
      priceConfirmed: true,
    },
    {
      startsAt: start,
      status: "full",
      availableSeats: 0,
      sourcePriceVnd: "1",
      priceConfirmed: true,
    },
    {
      startsAt: start,
      status: "open",
      availableSeats: 0,
      sourcePriceVnd: "2",
      priceConfirmed: true,
    },
    {
      startsAt: start,
      status: "closed",
      availableSeats: 20,
      sourcePriceVnd: "3",
      priceConfirmed: true,
    },
    {
      startsAt: "2020-01-01T00:00:00Z",
      status: "open",
      availableSeats: 20,
      sourcePriceVnd: "4",
      priceConfirmed: true,
    },
  ];
  assert.deepEqual(departureSummary(rows, now), {
    upcomingDepartures: 2,
    sourcePriceVnd: "100",
    priceVnd: "2000000",
  });
  assert.equal(
    compareAmounts(
      "9007199254740993.000000000000000000000000000001",
      "9007199254740993.000000000000000000000000000002",
    ),
    -1,
  );
});

test("local departure CRUD persists, respects ownership/revision and hides private prices", async (t) => {
  const { path, repo, id, seed } = await setup(t);
  const saved = await repo.saveDeparture(id, valid),
    departure = saved.departures[0];
  assert.equal(saved.revision, 2);
  assert.equal(departure.basePriceVnd, "2000000");
  const reopened = createLocalAdminCatalog(path, async () => {
    throw new Error("must read saved catalog");
  });
  assert.deepEqual(await reopened.getDepartures(id), saved);
  const visible = (await reopened.publicCatalog()).tours[0];
  assert.equal(visible.priceVnd, "2500000");
  assert.equal(visible.departures[0].availableSeats, 20);
  assert.ok(!JSON.stringify(visible).includes("basePriceVnd"));
  assert.ok(!JSON.stringify(visible).includes("departureManagement"));
  await assert.rejects(repo.saveDeparture(id, valid), { status: 409 });
  const before = await readFile(path, "utf8");
  await assert.rejects(
    repo.saveDeparture(seed.tours[1].id, valid, departure.id),
    { status: 404 },
  );
  assert.equal(await readFile(path, "utf8"), before);
  const closed = await repo.saveDeparture(
    id,
    { ...valid, revision: 2, status: "closed", bookedPeople: 1 },
    departure.id,
  );
  assert.equal((await repo.publicCatalog()).tours[0].priceVnd, null);
  await assert.rejects(
    repo.archiveDeparture(id, departure.id, closed.revision),
    { code: "departure_has_guests" },
  );
  const empty = await repo.saveDeparture(
    id,
    { ...valid, revision: 3, status: "closed" },
    departure.id,
  );
  await repo.archiveDeparture(id, departure.id, empty.revision);
  assert.equal((await reopened.getDepartures(id)).departures.length, 0);
  assert.equal((await reopened.publicCatalog()).tours[0].departures.length, 0);
  const content = await repo.getContent(id);
  await repo.saveContent(id, {
    revision: content.revision,
    images: [],
    days: [],
  });
  await assert.rejects(
    repo.saveDeparture(id, { ...valid, revision: content.revision }),
    { status: 409 },
  );
});

test("old snapshots keep unknown capacity/base price and unconfirmed units", async (t) => {
  const { path, seed, id } = await setup(t),
    oldId = randomUUID();
  seed.tours[0].departures.push({
    id: oldId,
    startsAt: valid.startsAt,
    endsAt: valid.endsAt,
    sourcePriceVnd: "848214.2857142857",
    status: "open",
    needsReview: true,
    priceConfirmed: false,
    availableSeats: null,
  });
  const repo = createLocalAdminCatalog(path, async () => seed);
  const old = (await repo.getDepartures(id)).departures[0];
  assert.equal(old.minPeople, null);
  assert.equal(old.bookedPeople, null);
  assert.equal(old.basePriceVnd, null);
  assert.equal(old.priceConfirmed, false);
  await assert.rejects(repo.archiveDeparture(id, oldId, 1), {
    code: "departure_has_guests",
  });
  const closed = await repo.closeDeparture(id, oldId, 1);
  assert.equal(closed.departures[0].status, "closed");
  assert.equal(closed.departures[0].bookedPeople, null);
  assert.equal(closed.departures[0].basePriceVnd, null);
  assert.equal(closed.departures[0].salePriceVnd, old.salePriceVnd);
  assert.equal((await repo.publicCatalog()).tours[0].upcomingDepartures, 0);
  assert.equal((await repo.publicCatalog()).tours[0].priceVnd, null);
});

test("departure endpoints enforce Admin, Origin, validation and public price updates", async (t) => {
  const { repo, id } = await setup(t),
    auth = await createLocalAuthRepository(),
    userId = randomUUID(),
    token = "f".repeat(64);
  await auth.register(
    {
      id: userId,
      email: "departures@example.test",
      name: "Test",
      role: "USER",
      passwordHash: "test-only",
    },
    {
      id: randomUUID(),
      userId,
      tokenHash: tokenDigest(token),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  );
  const cookie = `${sessionCookieName}=${token}`,
    origin = new URL(env.CLIENT_ORIGIN).origin;
  const app = express();
  app.use(express.json());
  app.use(
    "/admin",
    createAdminCatalogRouter(
      () => repo,
      async () => auth,
    ),
  );
  app.use(
    "/explore",
    createCatalogRouter(() => repo.publicCatalog()),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const path = `/admin/tours/${id}/departures`;
  const change = (
    method: string,
    suffix: string,
    body: unknown,
    source: string | null = origin,
  ) =>
    fetch(`${base}${path}${suffix}`, {
      method,
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        ...(source ? { Origin: source } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(`${base}${path}`)).status, 401);
    assert.equal((await change("POST", "", valid)).status, 403);
    await auth.promoteAdmin("departures@example.test");
    assert.equal((await change("POST", "", valid, null)).status, 403);
    assert.equal(
      (await change("POST", "", valid, "https://untrusted.test")).status,
      403,
    );
    assert.equal(
      (await change("POST", "", { ...valid, salePriceVnd: "1.5" })).status,
      400,
    );
    const created = await change("POST", "", valid);
    assert.equal(created.status, 201);
    const result = (await created.json()).data,
      departureId = result.departures[0].id;
    assert.equal((await change("PATCH", `/${departureId}`, valid)).status, 409);
    const detail = (await (await fetch(`${base}/explore/tours/${id}`)).json())
      .data;
    assert.equal(detail.priceVnd, "2500000");
    assert.equal(detail.departures[0].priceConfirmed, true);
    assert.ok(!JSON.stringify(detail).includes("basePriceVnd"));
    assert.equal(
      (await change("PATCH", `/${randomUUID()}`, { ...valid, revision: 2 }))
        .status,
      404,
    );
    assert.equal(
      (
        await change("DELETE", `/${departureId}`, {
          revision: 2,
          bookedPeople: 0,
        })
      ).status,
      400,
    );
    assert.equal(
      (await change("POST", `/${departureId}/close`, { revision: 2 })).status,
      200,
    );
    assert.equal(
      (await change("DELETE", `/${departureId}`, { revision: 3 })).status,
      200,
    );
    assert.equal(
      (await (await fetch(`${base}/explore/tours/${id}`)).json()).data.priceVnd,
      null,
    );
    await auth.deleteSession(tokenDigest(token));
    assert.equal((await change("POST", "", valid)).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await auth.close();
  }
});
