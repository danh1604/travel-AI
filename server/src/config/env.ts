import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

export const env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).optional(),
  AI_BASE_URL: z.string().default(""),
  AI_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default(""),
  WEATHER_PROVIDER: z.literal("weatherapi").default("weatherapi"),
  WEATHER_API_KEY: z.string().default(""),
}).parse(process.env);
