ALTER TABLE "User" ADD COLUMN "roleRevision" INTEGER NOT NULL DEFAULT 1 CHECK ("roleRevision" > 0);
CREATE TABLE "AccountRoleChange" (
  id UUID PRIMARY KEY,
  "actorId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "targetId" UUID NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "beforeRole" "UserRole" NOT NULL,
  "afterRole" "UserRole" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CHECK ("beforeRole" <> "afterRole")
);
CREATE INDEX "AccountRoleChange_targetId_createdAt_idx" ON "AccountRoleChange" ("targetId", "createdAt");
