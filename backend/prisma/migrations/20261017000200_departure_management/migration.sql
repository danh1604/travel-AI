ALTER TABLE "TourDeparture" ADD COLUMN "priceConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TourDeparture" ADD CONSTRAINT "TourDeparture_confirmed_price_check"
  CHECK (NOT "priceConfirmed" OR ("salePriceVnd"=trunc("salePriceVnd") AND "salePriceVnd"<=999999999999));
