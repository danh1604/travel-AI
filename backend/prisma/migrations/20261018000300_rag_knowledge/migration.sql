CREATE TABLE "KnowledgeChunk" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "destinations" JSONB NOT NULL DEFAULT '[]',
  "fingerprint" TEXT NOT NULL,
  "embedding" vector(384) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
