import "dotenv/config";
import { z } from "zod";
import { getAuthRepository, closeAuthRepository } from "../src/auth/repository.js";
import { disconnectDatabase } from "../src/config/database.js";

async function main() {
  const argument = process.argv.slice(2);
  if (argument.length !== 1 || !argument[0].startsWith("--email=")) throw new Error("Usage: npm.cmd run auth:admin -- --email=your-account@example.com");
  const email = z.string().trim().toLowerCase().max(254).email().parse(argument[0].slice(8));
  const repository = await getAuthRepository();
  if (!await repository.promoteAdmin(email)) throw new Error("Create the account through registration first. No existing password-based account found.");
  console.log("The selected account now has ADMIN access. Refresh its account page.");
}
main().catch((error: unknown) => {
  console.error(error instanceof Error && !error.name.includes("Prisma") ? error.message : "Admin promotion failed; check database connectivity.");
  process.exitCode = 1;
}).finally(async () => { await closeAuthRepository(); await disconnectDatabase(); });
