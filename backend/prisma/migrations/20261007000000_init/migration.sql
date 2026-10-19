-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Required for future RAG. Installed on both primary and Prisma shadow databases.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TravelStyle" AS ENUM ('RELAXED', 'BALANCED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('DEMO', 'INTERNAL', 'EXTERNAL_API');

-- CreateEnum
CREATE TYPE "CostUnit" AS ENUM ('PER_PERSON', 'PER_PERSON_ROUND_TRIP', 'PER_ROOM_NIGHT', 'PER_VEHICLE_TRIP', 'PER_GROUP');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'PLANNING', 'UPCOMING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('HOTEL', 'RESTAURANT', 'ATTRACTION', 'TRANSPORTATION', 'FREE_TIME');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('FLIGHT', 'TRAIN', 'BUS', 'CAR', 'TAXI', 'MOTORBIKE', 'BOAT');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "travelStyle" "TravelStyle" NOT NULL DEFAULT 'BALANCED',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "foodRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hotelPreferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredTransport" "TransportMode"[] DEFAULT ARRAY[]::"TransportMode"[],
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL DEFAULT 'VN',
    "description" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "DataSource" NOT NULL DEFAULT 'INTERNAL',
    "sourceUrl" TEXT,
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "priceVnd" DECIMAL(14,0) NOT NULL,
    "costUnit" "CostUnit" NOT NULL DEFAULT 'PER_ROOM_NIGHT',
    "roomCapacity" INTEGER NOT NULL DEFAULT 2,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "DataSource" NOT NULL DEFAULT 'INTERNAL',
    "sourceUrl" TEXT,
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "priceVnd" DECIMAL(14,0) NOT NULL,
    "costUnit" "CostUnit" NOT NULL DEFAULT 'PER_PERSON',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "foodOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "DataSource" NOT NULL DEFAULT 'INTERNAL',
    "sourceUrl" TEXT,
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attraction" (
    "id" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "priceVnd" DECIMAL(14,0) NOT NULL,
    "costUnit" "CostUnit" NOT NULL DEFAULT 'PER_PERSON',
    "durationMinutes" INTEGER NOT NULL,
    "isIndoor" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "DataSource" NOT NULL DEFAULT 'INTERNAL',
    "sourceUrl" TEXT,
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Attraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transportation" (
    "id" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departure" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mode" "TransportMode" NOT NULL,
    "priceVnd" DECIMAL(14,0) NOT NULL,
    "costUnit" "CostUnit" NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "durationMinutes" INTEGER NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'INTERNAL',
    "sourceUrl" TEXT,
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transportation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "departureLocation" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "people" INTEGER NOT NULL,
    "totalBudgetVnd" DECIMAL(14,0) NOT NULL,
    "travelStyle" "TravelStyle" NOT NULL DEFAULT 'BALANCED',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "shareToken" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDay" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,

    CONSTRAINT "TripDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripActivity" (
    "id" UUID NOT NULL,
    "tripDayId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "ActivityType" NOT NULL,
    "hotelId" UUID,
    "restaurantId" UUID,
    "attractionId" UUID,
    "transportationId" UUID,
    "name" TEXT NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "unitPriceVnd" DECIMAL(14,0) NOT NULL,
    "costUnit" "CostUnit" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "estimatedCostVnd" DECIMAL(14,0) NOT NULL,
    "source" "DataSource" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TripActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCallId" TEXT,
    "structuredData" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_slug_key" ON "Destination"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_slug_key" ON "Hotel"("slug");

-- CreateIndex
CREATE INDEX "Hotel_destinationId_isActive_priceVnd_idx" ON "Hotel"("destinationId", "isActive", "priceVnd");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE INDEX "Restaurant_destinationId_isActive_priceVnd_idx" ON "Restaurant"("destinationId", "isActive", "priceVnd");

-- CreateIndex
CREATE UNIQUE INDEX "Attraction_slug_key" ON "Attraction"("slug");

-- CreateIndex
CREATE INDEX "Attraction_destinationId_isActive_priceVnd_idx" ON "Attraction"("destinationId", "isActive", "priceVnd");

-- CreateIndex
CREATE UNIQUE INDEX "Transportation_slug_key" ON "Transportation"("slug");

-- CreateIndex
CREATE INDEX "Transportation_destinationId_departure_mode_priceVnd_idx" ON "Transportation"("destinationId", "departure", "mode", "priceVnd");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_shareToken_key" ON "Trip"("shareToken");

-- CreateIndex
CREATE INDEX "Trip_ownerId_status_startDate_idx" ON "Trip"("ownerId", "status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "TripDay_tripId_dayNumber_key" ON "TripDay"("tripId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TripDay_tripId_date_key" ON "TripDay"("tripId", "date");

-- CreateIndex
CREATE INDEX "TripActivity_hotelId_idx" ON "TripActivity"("hotelId");

-- CreateIndex
CREATE INDEX "TripActivity_restaurantId_idx" ON "TripActivity"("restaurantId");

-- CreateIndex
CREATE INDEX "TripActivity_attractionId_idx" ON "TripActivity"("attractionId");

-- CreateIndex
CREATE INDEX "TripActivity_transportationId_idx" ON "TripActivity"("transportationId");

-- CreateIndex
CREATE UNIQUE INDEX "TripActivity_tripDayId_position_key" ON "TripActivity"("tripDayId", "position");

-- CreateIndex
CREATE INDEX "Conversation_tripId_idx" ON "Conversation"("tripId");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attraction" ADD CONSTRAINT "Attraction_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transportation" ADD CONSTRAINT "Transportation_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripDay" ADD CONSTRAINT "TripDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "Attraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_transportationId_fkey" FOREIGN KEY ("transportationId") REFERENCES "Transportation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants that Prisma schema cannot express.
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_coordinates_check"
  CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);

ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_price_capacity_check"
  CHECK ("priceVnd" >= 0 AND "roomCapacity" > 0 AND "costUnit" = 'PER_ROOM_NIGHT');
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_price_unit_check"
  CHECK ("priceVnd" >= 0 AND "costUnit" = 'PER_PERSON');
ALTER TABLE "Attraction" ADD CONSTRAINT "Attraction_price_duration_check"
  CHECK ("priceVnd" >= 0 AND "durationMinutes" > 0 AND "costUnit" IN ('PER_PERSON', 'PER_GROUP'));
ALTER TABLE "Transportation" ADD CONSTRAINT "Transportation_price_capacity_check"
  CHECK ("priceVnd" >= 0 AND "capacity" > 0 AND "durationMinutes" > 0
    AND "costUnit" IN ('PER_PERSON', 'PER_PERSON_ROUND_TRIP', 'PER_VEHICLE_TRIP', 'PER_GROUP'));

ALTER TABLE "Trip" ADD CONSTRAINT "Trip_dates_budget_people_check"
  CHECK ("endDate" >= "startDate" AND "totalBudgetVnd" > 0 AND "people" > 0 AND "version" > 0);
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_public_token_check"
  CHECK (NOT "isPublic" OR "shareToken" IS NOT NULL);
ALTER TABLE "TripDay" ADD CONSTRAINT "TripDay_number_check" CHECK ("dayNumber" > 0);

ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_cost_time_check"
  CHECK ("position" >= 0 AND "endTime" > "startTime" AND "unitPriceVnd" >= 0
    AND "quantity" > 0 AND "estimatedCostVnd" = round("unitPriceVnd" * "quantity"));
ALTER TABLE "TripActivity" ADD CONSTRAINT "TripActivity_reference_check"
  CHECK (
    ("type" = 'HOTEL' AND "hotelId" IS NOT NULL AND "restaurantId" IS NULL AND "attractionId" IS NULL AND "transportationId" IS NULL)
    OR ("type" = 'RESTAURANT' AND "restaurantId" IS NOT NULL AND "hotelId" IS NULL AND "attractionId" IS NULL AND "transportationId" IS NULL)
    OR ("type" = 'ATTRACTION' AND "attractionId" IS NOT NULL AND "hotelId" IS NULL AND "restaurantId" IS NULL AND "transportationId" IS NULL)
    OR ("type" = 'TRANSPORTATION' AND "transportationId" IS NOT NULL AND "hotelId" IS NULL AND "restaurantId" IS NULL AND "attractionId" IS NULL)
    OR ("type" = 'FREE_TIME' AND "hotelId" IS NULL AND "restaurantId" IS NULL AND "attractionId" IS NULL AND "transportationId" IS NULL AND "unitPriceVnd" = 0)
  );
