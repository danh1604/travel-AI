import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../config/env.js";
import { getAuthRepository } from "../auth/repository.js";
import type { AuthRepository } from "../auth/types.js";
import { readToken, tokenDigest } from "../auth/router.js";
import { loadCatalog, CatalogUnavailable } from "../catalog/repository.js";
import { ReviewConflict } from "./repository.js";

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
const revision = z.number().int().min(1).max(2147483646);
export const reviewInput = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).default(""), revision: revision.or(z.literal(0)) }).strict();
export function createReviewsRouter(auth: () => Promise<AuthRepository> = getAuthRepository, catalog = loadCatalog) {
  const router = Router();
  const limit = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { code: "reviews_rate_limit" } });
  router.use(async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    const repo = await auth(), token = readToken(request);
    const user = token ? await repo.findSession(tokenDigest(token), new Date()) : null;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (!user) { response.status(401).json({ code: "login_required" }); return; }
      if (request.get("Origin") !== new URL(env.CLIENT_ORIGIN).origin) { response.status(403).json({ code: "invalid_origin" }); return; }
      if (!request.is("application/json")) { response.status(415).json({ code: "json_required" }); return; }
    }
    if (request.path.startsWith("/admin") && user?.role !== "ADMIN") { response.status(user ? 403 : 401).json({ code: user ? "admin_required" : "login_required" }); return; }
    response.locals.repo = repo; response.locals.user = user; next();
  });
  router.get("/admin", async (request, response) => {
    const query = pageQuery.safeParse(request.query);
    if (!query.success) { response.status(400).json({ code: "invalid_review_request" }); return; }
    response.json(await (response.locals.repo as AuthRepository).adminReviews(query.data.page));
  });
  router.patch("/admin/:id", limit, async (request, response) => {
    const input = z.object({ hidden: z.boolean(), revision }).strict().safeParse(request.body);
    if (!z.string().uuid().safeParse(request.params.id).success || !input.success) { response.status(400).json({ code: "invalid_review_request" }); return; }
    await (response.locals.repo as AuthRepository).moderateReview(z.string().uuid().parse(request.params.id), input.data.hidden, input.data.revision);
    response.status(204).end();
  });
  router.use("/tours/:tourId", async (request, response, next) => {
    if (!z.string().uuid().safeParse(request.params.tourId).success) { response.status(400).json({ code: "invalid_review_request" }); return; }
    if (!(await catalog()).tours.some((tour) => tour.id === request.params.tourId)) { response.status(404).json({ code: "tour_not_found" }); return; }
    next();
  });
  router.get("/tours/:tourId", async (request, response) => {
    const query = pageQuery.safeParse(request.query);
    if (!query.success) { response.status(400).json({ code: "invalid_review_request" }); return; }
    response.json(await (response.locals.repo as AuthRepository).listReviews(request.params.tourId, response.locals.user?.id ?? null, query.data.page));
  });
  router.put("/tours/:tourId/mine", limit, async (request, response) => {
    const input = reviewInput.safeParse(request.body);
    if (!input.success) { response.status(400).json({ code: "invalid_review_request" }); return; }
    await (response.locals.repo as AuthRepository).writeReview(z.string().uuid().parse(request.params.tourId), response.locals.user.id, input.data);
    response.status(204).end();
  });
  router.delete("/tours/:tourId/mine", limit, async (request, response) => {
    const input = z.object({ revision }).strict().safeParse(request.body);
    if (!input.success) { response.status(400).json({ code: "invalid_review_request" }); return; }
    await (response.locals.repo as AuthRepository).deleteReview(z.string().uuid().parse(request.params.tourId), response.locals.user.id, input.data.revision);
    response.status(204).end();
  });
  router.use((error: unknown, _request: import("express").Request, response: import("express").Response, _next: import("express").NextFunction) => {
    response.status(error instanceof ReviewConflict ? 409 : 503).json({ code: error instanceof ReviewConflict ? "review_conflict" : error instanceof CatalogUnavailable ? "catalog_unavailable" : "reviews_unavailable" });
  });
  return router;
}
