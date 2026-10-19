CREATE TABLE "SavedPlan" (
  "id" UUID NOT NULL PRIMARY KEY,
  "ownerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "savedAt" TIMESTAMPTZ(3),
  CONSTRAINT "SavedPlan_ready_snapshot" CHECK ((jsonb_typeof("snapshot") = 'object' AND "snapshot"->>'status' = 'ready') IS TRUE)
);
CREATE INDEX "SavedPlan_ownerId_savedAt_id_idx" ON "SavedPlan"("ownerId", "savedAt" DESC, "id");
