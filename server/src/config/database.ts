import pg from "pg";
import { env } from "./env.js";

// Lazy connection: the skeleton can start before a database is configured.
export const database = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
database.on("error", (error) => console.error("Database pool error", error.message));
