import "dotenv/config";
import { BSON, MongoClient } from "mongodb";
import { Prisma } from "../src/generated/prisma/client.js";
import { getDatabase, disconnectDatabase } from "../src/config/database.js";

const { EJSON } = BSON;

const apply = process.argv.includes("--apply");
const collectionOption = process.argv.find((argument) => argument.startsWith("--collections="));
const selected = collectionOption?.split("=")[1]?.split(",").filter(Boolean);
const uri = process.env.MONGODB_SOURCE_URI;
if (!uri) throw new Error("Set MONGODB_SOURCE_URI in backend/.env. Never commit credentials.");
if (apply && !process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before applying the import.");

const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000, connectTimeoutMS: 10_000 });

async function main() {
  await mongo.connect();
  const source = mongo.db();
  const collections = await source.listCollections({}, { nameOnly: true }).toArray();
  if (selected?.some((name) => !collections.some((entry) => entry.name === name))) {
    throw new Error("One or more selected collections do not exist.");
  }
  if (apply) {
    // Fail before reading documents if the staging migration has not been applied.
    await getDatabase().legacyDocument.count();
  }
  for (const { name } of collections) {
    if (selected && !selected.includes(name)) continue;
    if (!apply) {
      console.log(JSON.stringify({ collection: name, count: await source.collection(name).countDocuments(), mode: "preview" }));
      continue;
    }
    let imported = 0;
    let batch: Prisma.LegacyDocumentCreateInput[] = [];
    async function flush() {
      if (!batch.length) return;
      await getDatabase().$transaction(batch.map((record) => getDatabase().legacyDocument.upsert({
        where: { sourceDatabase_collection_sourceId: {
          sourceDatabase: record.sourceDatabase, collection: record.collection, sourceId: record.sourceId,
        } },
        create: record,
        update: { payload: record.payload, importedAt: new Date() },
      })), { timeout: 30_000 });
      imported += batch.length;
      batch = [];
    }
    // Source access is strictly read-only: no update, delete or insert operations.
    for await (const document of source.collection(name).find({}).batchSize(100)) {
      batch.push({
        sourceDatabase: source.databaseName,
        collection: name,
        sourceId: EJSON.stringify(document._id, { relaxed: false }),
        payload: EJSON.serialize(document, { relaxed: false }) as Prisma.InputJsonObject,
      });
      if (batch.length === 100) await flush();
    }
    await flush();
    const targetCount = await getDatabase().legacyDocument.count({ where: { sourceDatabase: source.databaseName, collection: name } });
    console.log(JSON.stringify({ collection: name, imported, targetCount, mode: "applied" }));
  }
  console.log(apply ? "Import complete. Records are staged; canonical business mapping is still required." : "Preview complete. No target writes. Use --apply after applying migrations.");
}

main().catch((error: unknown) => {
  // Driver/Prisma errors can include URLs, documents and query values. Print only a classification.
  console.error(`Import failed (${error instanceof Error ? error.name : "unknown error"}). Check connectivity, credentials and migration status.`);
  process.exitCode = 1;
}).finally(async () => {
  await mongo.close();
  await disconnectDatabase();
});
