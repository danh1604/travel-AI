import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { getAuthRepository } from "./repository.js";
import { readToken, tokenDigest } from "./router.js";
import { AccountAdminError } from "./account-admin.js";
import type { AuthRepository } from "./types.js";

const querySchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    role: z.enum(["", "USER", "ADMIN"]).default(""),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
const roleSchema = z
  .object({
    role: z.enum(["USER", "ADMIN"]),
    revision: z.number().int().min(1).max(2_147_483_647),
  })
  .strict();

export function createAccountAdminRouter(
  loader: () => Promise<AuthRepository> = getAuthRepository,
) {
  const router = Router();
  router.use(async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    const token = readToken(request);
    const user = token
      ? await (await loader()).findSession(tokenDigest(token), new Date())
      : null;
    if (!user) {
      response.status(401).json({ code: "login_required" });
      return;
    }
    if (user.role !== "ADMIN") {
      response.status(403).json({ code: "admin_required" });
      return;
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (request.get("Origin") !== new URL(env.CLIENT_ORIGIN).origin) {
        response.status(403).json({ code: "invalid_origin" });
        return;
      }
      if (!request.is("application/json")) {
        response.status(415).json({ code: "json_required" });
        return;
      }
    }
    response.locals.actorId = user.id;
    next();
  });
  router.get("/", async (request, response) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ code: "invalid_input" });
      return;
    }
    response.json({
      ...(await (await loader()).listAccounts(parsed.data)),
      currentUserId: response.locals.actorId,
    });
  });
  router.patch("/:id/role", async (request, response) => {
    const id = z.string().uuid().safeParse(request.params.id),
      input = roleSchema.safeParse(request.body);
    if (!id.success || !input.success) {
      response.status(400).json({ code: "invalid_input" });
      return;
    }
    response.json({
      data: await (
        await loader()
      ).changeAccountRole(
        response.locals.actorId,
        id.data,
        input.data.role,
        input.data.revision,
      ),
    });
  });
  router.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof AccountAdminError) {
        response.status(error.status).json({ code: error.code });
        return;
      }
      console.warn(
        "Account administration failed:",
        error instanceof Error ? error.name : "unknown error",
      );
      response.status(503).json({ code: "accounts_unavailable" });
    },
  );
  return router;
}
