import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("Demo seed is disabled in production.");
}
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before seeding.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5_000 }),
});

async function main() {
  // Upserts create missing demo rows only; rerunning never overwrites admin edits.
  await prisma.$transaction(async (tx) => {
    const destination = await tx.destination.upsert({
      where: { slug: "demo-da-nang" },
      update: {},
      create: {
        slug: "demo-da-nang", name: "Đà Nẵng (demo)", province: "Đà Nẵng",
        description: "Bộ dữ liệu giả lập dùng để phát triển. Các dịch vụ và mức giá bên dưới không phải báo giá thực tế.",
        latitude: "16.054400", longitude: "108.202200", tags: ["beach", "food"], source: "DEMO",
      },
    });
    if (destination.source !== "DEMO") throw new Error("Demo destination slug belongs to non-demo data.");
    const common = { destinationId: destination.id, source: "DEMO" as const };

    for (const item of [
      { slug: "demo-hotel-budget", name: "Demo Beach Budget", priceVnd: "450000", tags: ["near beach", "budget"] },
      { slug: "demo-hotel-quiet", name: "Demo Quiet Stay", priceVnd: "750000", tags: ["near beach", "quiet"] },
      { slug: "demo-hotel-comfort", name: "Demo Comfort Hotel", priceVnd: "1100000", tags: ["near beach", "comfort"] },
    ]) {
      await tx.hotel.upsert({ where: { slug: item.slug }, update: {}, create: {
        ...common, ...item, description: "Khách sạn giả lập; giá mỗi phòng/đêm, phòng tối đa 2 người.",
        address: "Địa chỉ giả lập tại Đà Nẵng", costUnit: "PER_ROOM_NIGHT", roomCapacity: 2,
      } });
    }

    for (const item of [
      { slug: "demo-food-local", name: "Demo Local Kitchen", priceVnd: "80000", tags: ["local", "food"], foodOptions: ["meat", "vegetarian"] },
      { slug: "demo-food-vegetarian", name: "Demo Green Table", priceVnd: "120000", tags: ["vegetarian"], foodOptions: ["vegetarian", "vegan"] },
      { slug: "demo-food-seafood", name: "Demo Seafood Table", priceVnd: "250000", tags: ["seafood"], foodOptions: ["seafood"] },
      { slug: "demo-food-family", name: "Demo Family Kitchen", priceVnd: "150000", tags: ["family", "food"], foodOptions: ["meat", "vegetarian"] },
    ]) {
      await tx.restaurant.upsert({ where: { slug: item.slug }, update: {}, create: {
        ...common, ...item, description: "Nhà hàng giả lập; giá ước tính một bữa ăn/người.",
        address: "Địa chỉ giả lập tại Đà Nẵng", costUnit: "PER_PERSON",
      } });
    }

    for (const item of [
      { slug: "demo-beach", name: "Demo Beach Walk", priceVnd: "0", durationMinutes: 120, isIndoor: false, tags: ["beach", "relax"] },
      { slug: "demo-museum", name: "Demo Culture Museum", priceVnd: "60000", durationMinutes: 90, isIndoor: true, tags: ["culture", "indoor"] },
      { slug: "demo-park", name: "Demo Riverside Park", priceVnd: "0", durationMinutes: 60, isIndoor: false, tags: ["relax", "family"] },
      { slug: "demo-workshop", name: "Demo Cooking Workshop", priceVnd: "350000", durationMinutes: 150, isIndoor: true, tags: ["food", "indoor"] },
    ]) {
      await tx.attraction.upsert({ where: { slug: item.slug }, update: {}, create: {
        ...common, ...item, description: "Hoạt động giả lập, dùng kiểm tra lập lịch và tính ngân sách.",
        address: "Địa chỉ giả lập tại Đà Nẵng", costUnit: "PER_PERSON",
      } });
    }

    await tx.transportation.upsert({ where: { slug: "demo-flight-hcm-danang" }, update: {}, create: {
      ...common, slug: "demo-flight-hcm-danang", name: "Demo Flight TP.HCM – Đà Nẵng",
      departure: "TP.HCM", description: "Giá giả lập vé khứ hồi/người; không phản ánh giá hoặc tình trạng chuyến bay thực tế.",
      mode: "FLIGHT", priceVnd: "2100000", costUnit: "PER_PERSON_ROUND_TRIP", capacity: 1, durationMinutes: 90,
    } });
    await tx.transportation.upsert({ where: { slug: "demo-local-car" }, update: {}, create: {
      ...common, slug: "demo-local-car", name: "Demo Local Car", departure: "Đà Nẵng",
      description: "Giá giả lập/chuyến xe, tối đa 4 hành khách. Thời gian di chuyển chỉ là dữ liệu demo.",
      mode: "CAR", priceVnd: "180000", costUnit: "PER_VEHICLE_TRIP", capacity: 4, durationMinutes: 30,
    } });
  }, { timeout: 30_000 });
  console.log("Demo seed complete: 1 destination, 3 hotels, 4 restaurants, 4 attractions, 2 transportations (missing rows created only).");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed failed");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
