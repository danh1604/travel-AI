import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { MappingPlan } from "../src/legacy/mapping.js";

const tables = {
  categories: "TourCategory", places: "CatalogPlace", services: "CatalogService", tours: "Tour",
  departures: "TourDeparture", departureServices: "DepartureService", days: "TourDay", stops: "TourStop",
  images: "CatalogImage", sections: "TourSection", discounts: "TourDiscount",
} as const;

// Isolated PostgreSQL/WASM verification; no network writes or persistent database.
export async function verifyMappingPlan(plan: MappingPlan) {
  const database = new PGlite({ extensions: { vector } });
  try {
    const root = new URL("../prisma/migrations/", import.meta.url);
    for (const entry of (await readdir(root, { withFileTypes: true })).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await database.exec(await readFile(new URL(`${entry.name}/migration.sql`, root), "utf8"));
    }
    for (let run = 0; run < 2; run++) {
      await database.transaction(async (tx) => {
        for (const [key, table] of Object.entries(tables)) {
          const rows = plan[key as keyof typeof tables] as unknown as Record<string, unknown>[];
          for (let offset = 0; offset < rows.length; offset += 100) {
            const batch = rows.slice(offset, offset + 100);
            const columns = Object.keys(batch[0]);
            const params: unknown[] = [];
            const values = batch.map((row) => `(${columns.map((column) => {
              const value = row[column];
              params.push(value instanceof Date ? value.toISOString() : value);
              return `$${params.length}`;
            }).join(",")})`);
            // SQL identifiers come exclusively from fixed mapper output, never source fields.
            await tx.query(`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(",")}) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`, params);
          }
          const result = await tx.query<{ count: number }>(`SELECT count(*)::int AS count FROM "${table}"`);
          assert.equal(result.rows[0].count, rows.length, `${table}: unexpected row count on run ${run + 1}`);
        }
      });
    }
    return { migrations: "passed", foreignKeys: "passed", rerun: "passed", database: "isolated PGlite" };
  } finally { await database.close(); }
}
