import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

test("initial migration enforces budget, references and catalog integrity", async (t) => {
  const db = new PGlite({ extensions: { vector } });
  try {
    const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
    for (const entry of (await readdir(migrationRoot, { withFileTypes: true })).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await db.exec(await readFile(new URL(`${entry.name}/migration.sql`, migrationRoot), "utf8"));
    }
    await t.test("pgvector is installed", async () => {
      const { rows } = await db.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
      assert.equal(rows.length, 1);
    });
    await t.test("legacy source identity supports idempotent imports and preserves Extended JSON", async () => {
      await db.query(`INSERT INTO "LegacyDocument" (id, "sourceDatabase", collection, "sourceId", payload, "updatedAt")
        VALUES ($1, 'source-test', 'places', 'mongo-id', $2, now())`,
      ["00000000-0000-4000-8000-000000000010", JSON.stringify({ _id: { $oid: "507f1f77bcf86cd799439011" }, createdAt: { $date: { $numberLong: "1791331200000" } } })]);
      const preserved = (await db.query('SELECT payload FROM "LegacyDocument"')).rows[0].payload;
      assert.equal(preserved._id.$oid, "507f1f77bcf86cd799439011");
      assert.equal(preserved.createdAt.$date.$numberLong, "1791331200000");
      await db.exec(`INSERT INTO "LegacyDocument" (id, "sourceDatabase", collection, "sourceId", payload, "updatedAt")
        VALUES ('00000000-0000-4000-8000-000000000011', 'source-test', 'places', 'mongo-id', '{"changed":true}', now())
        ON CONFLICT ("sourceDatabase", collection, "sourceId") DO UPDATE SET payload = EXCLUDED.payload`);
      const { rows } = await db.query('SELECT payload FROM "LegacyDocument"');
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0].payload, { changed: true });
    });

    await db.exec(`
      INSERT INTO "User" (id, email, name, "updatedAt")
      VALUES ('00000000-0000-4000-8000-000000000001', 'test@example.test', 'Test', now());
      INSERT INTO "Destination" (id, slug, name, province, description, latitude, longitude, "updatedAt")
      VALUES ('00000000-0000-4000-8000-000000000002', 'test', 'Test', 'Test', 'Test', 16, 108, now());
      INSERT INTO "Hotel" (id, "destinationId", slug, name, description, address, "priceVnd", "updatedAt")
      VALUES ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'test-hotel', 'Test', 'Test', 'Test', 750000, now());
      INSERT INTO "Trip" (id, "ownerId", "destinationId", title, "departureLocation", "startDate", "endDate", people, "totalBudgetVnd", "updatedAt")
      VALUES ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Test', 'TP.HCM', '2026-12-01', '2026-12-04', 2, 16000000, now());
      INSERT INTO "TripDay" (id, "tripId", "dayNumber", date)
      VALUES ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000004', 1, '2026-12-01');
      INSERT INTO "TripActivity" (id, "tripDayId", position, type, "hotelId", name, "startTime", "endTime", "unitPriceVnd", "costUnit", quantity, "estimatedCostVnd", source, "updatedAt")
      VALUES ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000005', 0, 'HOTEL', '00000000-0000-4000-8000-000000000003', 'Test stay', '10:00', '10:30', 750000, 'PER_ROOM_NIGHT', 3, 2250000, 'DEMO', now());
    `);
    const rejectsCheck = (sql) => assert.rejects(db.exec(sql), (error) => error.code === "23514");
    await t.test("rejects negative prices and invalid room capacity", async () => {
      await rejectsCheck('UPDATE "Hotel" SET "priceVnd" = -1');
      await rejectsCheck('UPDATE "Hotel" SET "roomCapacity" = 0');
    });
    await t.test("rejects invalid dates, people and budget", async () => {
      await rejectsCheck('UPDATE "Trip" SET people = 0');
      await rejectsCheck('UPDATE "Trip" SET "totalBudgetVnd" = -1');
      await rejectsCheck('UPDATE "Trip" SET "endDate" = \'2026-11-30\'');
    });
    await t.test("rejects sharing without a token", async () => {
      await rejectsCheck('UPDATE "Trip" SET "isPublic" = true');
    });
    await t.test("retains exact multi-night price arithmetic", async () => {
      const { rows } = await db.query('SELECT "estimatedCostVnd"::text AS cost FROM "TripActivity"');
      assert.equal(rows[0].cost, "2250000");
      await rejectsCheck('UPDATE "TripActivity" SET "estimatedCostVnd" = 750000');
    });
    await t.test("rejects wrong entity reference and reversed time range", async () => {
      await rejectsCheck('UPDATE "TripActivity" SET type = \'RESTAURANT\'');
      await rejectsCheck('UPDATE "TripActivity" SET "hotelId" = NULL');
      await rejectsCheck('UPDATE "TripActivity" SET "endTime" = \'09:00\'');
    });
    await t.test("protects referenced catalog data from hard deletion", async () => {
      await assert.rejects(db.exec('DELETE FROM "Hotel"'), (error) => ["23503", "23001"].includes(error.code));
    });
    await t.test("deleting a trip removes days and activities", async () => {
      await db.exec('DELETE FROM "Trip"');
      assert.equal((await db.query('SELECT * FROM "TripDay"')).rows.length, 0);
      assert.equal((await db.query('SELECT * FROM "TripActivity"')).rows.length, 0);
      assert.equal((await db.query('SELECT * FROM "Hotel"')).rows.length, 1);
    });
  } finally { await db.close(); }
});
