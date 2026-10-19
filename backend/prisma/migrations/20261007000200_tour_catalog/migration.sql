-- CreateTable
CREATE TABLE "TourCategory" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "TourCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tour" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "departureLocation" TEXT NOT NULL,
    "durationDays" INTEGER,
    "legacyHotelId" TEXT,
    "categoryId" UUID NOT NULL,
    "destinationId" UUID,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "sourceUpdatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogPlace" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "destinationId" UUID,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CatalogPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogService" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "basePriceVnd" DECIMAL(65,30) NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "destinationId" UUID,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "sourceUpdatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CatalogService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourDeparture" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tourId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "basePriceVnd" DECIMAL(65,30) NOT NULL,
    "salePriceVnd" DECIMAL(65,30) NOT NULL,
    "minPeople" INTEGER NOT NULL,
    "maxPeople" INTEGER NOT NULL,
    "bookedPeople" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "sourceUpdatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TourDeparture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartureService" (
    "id" UUID NOT NULL,
    "departureId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "unitPriceVnd" DECIMAL(65,30) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "note" TEXT,

    CONSTRAINT "DepartureService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourDay" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tourId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "mealNote" TEXT,

    CONSTRAINT "TourDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourStop" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dayId" UUID NOT NULL,
    "placeId" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "TourStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImage" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceCollection" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storagePublicId" TEXT,
    "tourId" UUID,
    "placeId" UUID,

    CONSTRAINT "CatalogImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourSection" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tourId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "TourSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourDiscount" (
    "id" UUID NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tourId" UUID NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TourDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TourCategory_sourceDatabase_sourceId_key" ON "TourCategory"("sourceDatabase", "sourceId");

-- CreateIndex
CREATE INDEX "Tour_status_destinationId_idx" ON "Tour"("status", "destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "Tour_sourceDatabase_sourceId_key" ON "Tour"("sourceDatabase", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPlace_sourceDatabase_sourceId_key" ON "CatalogPlace"("sourceDatabase", "sourceId");

-- CreateIndex
CREATE INDEX "CatalogService_type_status_idx" ON "CatalogService"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogService_sourceDatabase_sourceId_key" ON "CatalogService"("sourceDatabase", "sourceId");

-- CreateIndex
CREATE INDEX "TourDeparture_tourId_startsAt_status_idx" ON "TourDeparture"("tourId", "startsAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TourDeparture_sourceDatabase_sourceId_key" ON "TourDeparture"("sourceDatabase", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartureService_departureId_position_key" ON "DepartureService"("departureId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TourDay_sourceDatabase_sourceId_key" ON "TourDay"("sourceDatabase", "sourceId");

-- CreateIndex
CREATE INDEX "TourDay_tourId_dayNumber_idx" ON "TourDay"("tourId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TourStop_sourceDatabase_sourceId_key" ON "TourStop"("sourceDatabase", "sourceId");

-- CreateIndex
CREATE INDEX "TourStop_dayId_position_idx" ON "TourStop"("dayId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogImage_sourceDatabase_sourceCollection_sourceId_key" ON "CatalogImage"("sourceDatabase", "sourceCollection", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TourSection_sourceDatabase_sourceId_key" ON "TourSection"("sourceDatabase", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TourDiscount_sourceDatabase_sourceId_key" ON "TourDiscount"("sourceDatabase", "sourceId");

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TourCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPlace" ADD CONSTRAINT "CatalogPlace_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogService" ADD CONSTRAINT "CatalogService_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourDeparture" ADD CONSTRAINT "TourDeparture_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureService" ADD CONSTRAINT "DepartureService_departureId_fkey" FOREIGN KEY ("departureId") REFERENCES "TourDeparture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartureService" ADD CONSTRAINT "DepartureService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "CatalogService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourDay" ADD CONSTRAINT "TourDay_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourStop" ADD CONSTRAINT "TourStop_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TourDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourStop" ADD CONSTRAINT "TourStop_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "CatalogPlace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImage" ADD CONSTRAINT "CatalogImage_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImage" ADD CONSTRAINT "CatalogImage_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "CatalogPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourSection" ADD CONSTRAINT "TourSection_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourDiscount" ADD CONSTRAINT "TourDiscount_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Tour" ADD CONSTRAINT "Tour_duration_status_check"
  CHECK (("durationDays" IS NULL OR "durationDays" > 0) AND "status" IN ('active', 'inactive'));
ALTER TABLE "TourCategory" ADD CONSTRAINT "TourCategory_status_check" CHECK ("status" IN ('active', 'inactive'));
ALTER TABLE "CatalogService" ADD CONSTRAINT "CatalogService_price_unit_check"
  CHECK ("basePriceVnd" >= 0 AND "status" IN ('active', 'inactive')
    AND "type" IN ('hotel', 'restaurant', 'transport', 'ticket', 'guide', 'other')
    AND "unit" IN ('per_room', 'per_day', 'per_meal', 'per_person'));
ALTER TABLE "TourDeparture" ADD CONSTRAINT "TourDeparture_validity_check"
  CHECK ("endsAt" >= "startsAt" AND "basePriceVnd" >= 0 AND "salePriceVnd" >= 0
    AND "minPeople" > 0 AND "maxPeople" >= "minPeople" AND "bookedPeople" BETWEEN 0 AND "maxPeople"
    AND "status" IN ('open', 'closed', 'full', 'deleted'));
ALTER TABLE "DepartureService" ADD CONSTRAINT "DepartureService_price_quantity_check"
  CHECK ("unitPriceVnd" >= 0 AND "quantity" > 0 AND "position" >= 0);
ALTER TABLE "TourDay" ADD CONSTRAINT "TourDay_day_check" CHECK ("dayNumber" > 0);
ALTER TABLE "TourStop" ADD CONSTRAINT "TourStop_order_type_check"
  CHECK ("position" >= 0 AND "type" IN ('eat', 'move', 'other', 'rest', 'visit'));
ALTER TABLE "CatalogImage" ADD CONSTRAINT "CatalogImage_owner_check"
  CHECK (("sourceCollection" = 'tour_images' AND "tourId" IS NOT NULL AND "placeId" IS NULL)
    OR ("sourceCollection" = 'place_images' AND "placeId" IS NOT NULL AND "tourId" IS NULL));
ALTER TABLE "TourDiscount" ADD CONSTRAINT "TourDiscount_percentage_check" CHECK ("percentage" BETWEEN 0 AND 100);
