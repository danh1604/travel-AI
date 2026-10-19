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
  CATALOG_SOURCE: z.enum(["snapshot", "postgres"]).default(process.env.NODE_ENV === "production" ? "postgres" : "snapshot"),
  AUTH_DATABASE_SOURCE: z.enum(["pglite", "postgres"]).default(process.env.NODE_ENV === "production" ? "postgres" : "pglite"),
  SESSION_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
}).superRefine((value, context) => {
  if (value.NODE_ENV === "production" && value.CATALOG_SOURCE === "snapshot") {
    context.addIssue({ code: "custom", path: ["CATALOG_SOURCE"], message: "Production requires the PostgreSQL catalog." });
  }
  if (value.NODE_ENV === "production" && value.AUTH_DATABASE_SOURCE !== "postgres") {
    context.addIssue({ code: "custom", path: ["AUTH_DATABASE_SOURCE"], message: "Production requires PostgreSQL authentication." });
  }
  if (value.SESSION_COOKIE_SAME_SITE === "none" && value.NODE_ENV !== "production") {
    context.addIssue({ code: "custom", path: ["SESSION_COOKIE_SAME_SITE"], message: "SameSite=None requires production HTTPS cookies." });
  }
  if (value.NODE_ENV === "production" && !value.CLIENT_ORIGIN.startsWith("https://")) {
    context.addIssue({ code: "custom", path: ["CLIENT_ORIGIN"], message: "Production authentication requires an HTTPS frontend origin." });
  }
}).parse(process.env);
