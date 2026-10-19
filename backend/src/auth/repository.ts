import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { createLocalAuthRepository } from "./local-repository.js";
import { postgresAuthRepository } from "./postgres-repository.js";
import type { AuthRepository } from "./types.js";

let repository: Promise<AuthRepository> | undefined;
export function getAuthRepository(): Promise<AuthRepository> {
  repository ??= (env.AUTH_DATABASE_SOURCE === "postgres" ? Promise.resolve(postgresAuthRepository()) : createLocalAuthRepository(fileURLToPath(new URL("../../data/auth/", import.meta.url)))).catch((error) => { repository = undefined; throw error; });
  return repository;
}
export async function closeAuthRepository() { await (await repository)?.close(); repository = undefined; }
