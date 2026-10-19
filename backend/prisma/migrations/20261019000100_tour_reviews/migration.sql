CREATE TABLE "TourReview" (
  "id" UUID PRIMARY KEY,
  "tourId" UUID NOT NULL,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "comment" TEXT NOT NULL DEFAULT '' CHECK (char_length("comment") <= 2000),
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  UNIQUE ("tourId", "userId")
);
CREATE INDEX "TourReview_tourId_hidden_createdAt_idx" ON "TourReview" ("tourId", "hidden", "createdAt" DESC);
CREATE INDEX "TourReview_createdAt_id_idx" ON "TourReview" ("createdAt" DESC, "id");
