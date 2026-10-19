import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";

let prisma: PrismaClient | undefined;

export function getDatabase(): PrismaClient {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  prisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5_000 }),
  });
  return prisma;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma?.$disconnect();
}
