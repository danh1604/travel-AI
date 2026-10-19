import { Router } from "express";
import { z } from "zod";
import { getAuthRepository } from "../auth/repository.js";
import type { AuthRepository } from "../auth/types.js";
import { readToken, tokenDigest } from "../auth/router.js";
import { env } from "../config/env.js";
import { tripEdit, TripEditError } from "./edit.js";

export function createTripsRouter(auth: () => Promise<AuthRepository> = getAuthRepository) {
  const router = Router();
  router.use(async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    const token = readToken(request);
    const repository = token ? await auth() : null;
    const user = repository && token ? await repository.findSession(tokenDigest(token), new Date()) : null;
    if (!user) { response.status(401).json({ code: "login_required" }); return; }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (request.get("Origin") !== new URL(env.CLIENT_ORIGIN).origin) { response.status(403).json({ code: "invalid_origin" }); return; }
      if (!request.is("application/json")) { response.status(415).json({ code: "json_required" }); return; }
    }
    response.locals.ownerId = user.id;
    response.locals.repository = repository;
    next();
  });
  router.get("/", async (request, response) => {
    const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(24).default(12) }).strict().safeParse(request.query);
    if (!query.success) { response.status(400).json({ code: "invalid_trip_request" }); return; }
    response.json(await (response.locals.repository as AuthRepository).listSavedPlans(response.locals.ownerId, query.data.page, query.data.limit));
  });
  router.post("/", async (request, response) => {
    const input = z.object({ draftId: z.string().uuid() }).strict().safeParse(request.body);
    if (!input.success) { response.status(400).json({ code: "invalid_trip_request" }); return; }
    const result = await (response.locals.repository as AuthRepository).savePlan(response.locals.ownerId, input.data.draftId);
    if (!result) { response.status(404).json({ code: "trip_not_found" }); return; }
    response.json({ data: result });
  });
  router.get("/:id", async (request, response) => {
    if (!z.string().uuid().safeParse(request.params.id).success) { response.status(400).json({ code: "invalid_trip_request" }); return; }
    const data = await (response.locals.repository as AuthRepository).getSavedPlan(response.locals.ownerId, request.params.id);
    if (!data) { response.status(404).json({ code: "trip_not_found" }); return; }
    response.json({ data });
  });
  router.delete("/:id", async (request, response) => {
    if (!z.string().uuid().safeParse(request.params.id).success || !z.object({}).strict().safeParse(request.body).success) { response.status(400).json({ code: "invalid_trip_request" }); return; }
    const removed = await (response.locals.repository as AuthRepository).deleteSavedPlan(response.locals.ownerId, request.params.id);
    if (!removed) { response.status(404).json({ code: "trip_not_found" }); return; }
    response.status(204).end();
  });
  router.patch("/:id", async (request, response) => {
    const input = tripEdit.safeParse(request.body);
    if (!input.success || !z.string().uuid().safeParse(request.params.id).success) { response.status(400).json({ code: "invalid_trip_request" }); return; }
    const data = await (response.locals.repository as AuthRepository).editSavedPlan(response.locals.ownerId, request.params.id, input.data);
    response.json({ data });
  });
  router.use((error: unknown, _request: import("express").Request, response: import("express").Response, _next: import("express").NextFunction) => response.status(error instanceof TripEditError ? error.status : 503).json({ code: error instanceof TripEditError ? error.code : "trips_unavailable" }));
  return router;
}
