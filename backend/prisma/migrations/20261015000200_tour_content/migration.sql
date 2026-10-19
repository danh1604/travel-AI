ALTER TABLE "TourStop" ADD COLUMN "placeLabel" TEXT;
ALTER TABLE "CatalogImage" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0 CHECK ("position" >= 0);
WITH ranked AS (
  SELECT id, (row_number() OVER (PARTITION BY "tourId", "placeId" ORDER BY id) - 1)::int AS position
  FROM "CatalogImage"
)
UPDATE "CatalogImage" i SET position = ranked.position FROM ranked WHERE i.id = ranked.id;
CREATE INDEX "CatalogImage_tourId_position_idx" ON "CatalogImage" ("tourId", position);
