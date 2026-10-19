-- CreateTable
CREATE TABLE "LegacyDocument" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LegacyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegacyDocument_sourceDatabase_collection_idx" ON "LegacyDocument"("sourceDatabase", "collection");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyDocument_sourceDatabase_collection_sourceId_key" ON "LegacyDocument"("sourceDatabase", "collection", "sourceId");
