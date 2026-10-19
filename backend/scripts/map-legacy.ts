import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { BSON, MongoClient } from "mongodb";
import { buildMappingPlan, catalogCollections, mappingSummary, type CatalogCollection, type LegacyDataset } from "../src/legacy/mapping.js";
import { persistMappingPlan } from "../src/legacy/persist.js";
import { getDatabase, disconnectDatabase } from "../src/config/database.js";
import { verifyMappingPlan } from "./verify-legacy.js";
import { projectCatalog } from "../src/catalog/project.js";

const args = process.argv.slice(2);
if (args.some((arg) => !["--apply", "--verify", "--snapshot"].includes(arg))) throw new Error("Supported arguments: --apply, --verify or --snapshot.");
const apply = args.includes("--apply");
if (apply && args.includes("--verify")) throw new Error("Use --verify separately from --apply.");
if (apply && args.includes("--snapshot")) throw new Error("Use --snapshot separately from --apply.");
let mongo: MongoClient | undefined;

async function main() {
  const dataset: LegacyDataset = {};
  let sourceDatabase: string;
  if (apply) {
    sourceDatabase = process.env.LEGACY_SOURCE_DATABASE ?? "";
    if (!sourceDatabase) throw new Error("Set LEGACY_SOURCE_DATABASE in backend/.env.");
    // Only catalog collections are read; users, bookings and payment records never enter this mapper.
    const staged = await getDatabase().legacyDocument.findMany({ where: { sourceDatabase, collection: { in: [...catalogCollections] } } });
    if (!staged.length) throw new Error("No staged catalog data. Run the source import first.");
    for (const row of staged) {
      const collection = row.collection as CatalogCollection;
      const document = BSON.EJSON.deserialize(row.payload as Record<string, unknown>) as Record<string, unknown>;
      (dataset[collection] ??= []).push(document);
    }
  } else {
    if (!process.env.MONGODB_SOURCE_URI) throw new Error("Set MONGODB_SOURCE_URI in backend/.env for preview.");
    mongo = new MongoClient(process.env.MONGODB_SOURCE_URI, { serverSelectionTimeoutMS: 15_000, connectTimeoutMS: 10_000 });
    await mongo.connect();
    const source = mongo.db();
    sourceDatabase = source.databaseName;
    for (const collection of catalogCollections) {
      dataset[collection] = await source.collection(collection).find({}).sort({ _id: 1 }).toArray();
    }
  }
  // Sort source records consistently so conflict handling is stable across runs.
  for (const collection of catalogCollections) {
    dataset[collection]?.sort((a, b) => String(a._id).localeCompare(String(b._id)));
  }
  const plan = buildMappingPlan(sourceDatabase, dataset);
  const summary = mappingSummary(plan, dataset);
  if (args.includes("--snapshot")) {
    await mkdir("data", { recursive: true });
    const catalog = projectCatalog(plan);
    await writeFile("data/catalog.snapshot.json", JSON.stringify(catalog), "utf8");
    console.log(`Development snapshot created: ${catalog.tours.length} active tours. Restart the API after regenerating.`);
  }
  const verification = args.includes("--verify") ? await verifyMappingPlan(plan) : undefined;
  const created = apply ? await persistMappingPlan(getDatabase(), plan) : undefined;
  await mkdir("reports", { recursive: true });
  await writeFile("reports/legacy-mapping.json", JSON.stringify({
    mode: apply ? "applied" : "preview", generatedAt: new Date().toISOString(), sourceDatabase,
    ...summary, created, verification, issues: plan.issues,
  }, null, 2), "utf8");
  console.log(JSON.stringify({ mode: apply ? "applied" : "preview", ...summary, created, verification }, null, 2));
  console.log("Report: backend/reports/legacy-mapping.json. Invalid records remain in staging; imported catalog needs review before planner use.");
}

main().catch((error: unknown) => {
  // Do not leak connection strings, raw documents or query arguments.
  console.error(`Legacy mapping failed (${error instanceof Error ? error.name : "unknown error"}). Check local env, migration status and source availability.`);
  process.exitCode = 1;
}).finally(async () => {
  await mongo?.close();
  await disconnectDatabase();
});
