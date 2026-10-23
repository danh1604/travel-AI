import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { getAuthRepository } from "../auth/repository.js";
import { readToken, tokenDigest } from "../auth/router.js";
import type { AuthRepository } from "../auth/types.js";
import {
  adminListQuery, publicServiceQuery, serviceKinds, travelInputs, travelKind, travelUpdate, TravelWriteError,
  type ServiceKind, type TravelKind,
} from "./contracts.js";

const slugParam = z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/);
const serviceKind = z.enum(serviceKinds);

function failure(error: unknown, response: Response) {
  if (error instanceof TravelWriteError) { response.status(error.status).json({ code: error.code }); return; }
  console.warn("Travel catalogue request failed:", error instanceof Error ? error.name : "unknown error");
  response.status(503).json({ code: "travel_unavailable" });
}
const guarded = (handler: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => { handler(request, response).catch(next); };

/** Public browsing of destinations, hotels, restaurants, attractions and transportation. */
export function createTravelRouter(auth: () => Promise<AuthRepository> = getAuthRepository) {
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.get("/destinations", guarded(async (_request, response) => {
    response.json({ data: await (await auth()).travelDestinations() });
  }));
  router.get("/destinations/:slug", guarded(async (request, response) => {
    const slug = slugParam.safeParse(request.params.slug);
    if (!slug.success) { response.status(400).json({ code: "invalid_travel_request" }); return; }
    const result = await (await auth()).travelDestination(slug.data);
    if (!result) { response.status(404).json({ code: "not_found" }); return; }
    response.json({ data: result });
  }));
  router.get("/:kind", guarded(async (request, response) => {
    const kind = serviceKind.safeParse(request.params.kind), query = publicServiceQuery.safeParse(request.query);
    if (!kind.success) { response.status(404).json({ code: "not_found" }); return; }
    if (!query.success) { response.status(400).json({ code: "invalid_travel_request" }); return; }
    response.json(await (await auth()).travelServices(kind.data, query.data));
  }));
  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => failure(error, response));
  return router;
}

/** Admin CRUD. Mounted at /admin/travel; same session, origin and JSON checks as the catalogue admin. */
export function createAdminTravelRouter(auth: () => Promise<AuthRepository> = getAuthRepository) {
  const router = Router();
  router.use(async (request, response, next) => {
    try {
      response.set("Cache-Control", "no-store");
      const token = readToken(request), repo = await auth();
      const user = token ? await repo.findSession(tokenDigest(token), new Date()) : null;
      if (!user) { response.status(401).json({ code: "login_required" }); return; }
      if (user.role !== "ADMIN") { response.status(403).json({ code: "admin_required" }); return; }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        if (request.get("Origin") !== new URL(env.CLIENT_ORIGIN).origin) { response.status(403).json({ code: "invalid_origin" }); return; }
        if (!request.is("application/json")) { response.status(415).json({ code: "json_required" }); return; }
      }
      response.locals.repo = repo;
      next();
    } catch (error) { next(error); }
  });
  const repo = (response: Response) => response.locals.repo as AuthRepository;
  router.get("/:kind", guarded(async (request, response) => {
    const kind = travelKind.safeParse(request.params.kind), query = adminListQuery.safeParse(request.query);
    if (!kind.success) { response.status(404).json({ code: "not_found" }); return; }
    if (!query.success) { response.status(400).json({ code: "invalid_input" }); return; }
    response.json(await repo(response).travelAdminList(kind.data, query.data));
  }));
  router.post("/:kind", guarded(async (request, response) => {
    const kind = travelKind.safeParse(request.params.kind);
    if (!kind.success) { response.status(404).json({ code: "not_found" }); return; }
    const input = travelInputs[kind.data].safeParse(request.body);
    if (!input.success) { response.status(400).json({ code: "invalid_input" }); return; }
    response.status(201).json({ data: await repo(response).travelSave(kind.data, input.data as never) });
  }));
  router.patch("/:kind/:id", guarded(async (request, response) => {
    const kind = travelKind.safeParse(request.params.kind), id = z.string().uuid().safeParse(request.params.id);
    if (!kind.success || !id.success) { response.status(400).json({ code: "invalid_input" }); return; }
    const withRevision = travelUpdate.safeParse(request.body);
    if (!withRevision.success) { response.status(400).json({ code: "invalid_input" }); return; }
    const { revision, ...body } = withRevision.data;
    const input = travelInputs[kind.data].safeParse(body);
    if (!input.success) { response.status(400).json({ code: "invalid_input" }); return; }
    response.json({ data: await repo(response).travelSave(kind.data, input.data as never, id.data, revision) });
  }));
  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => failure(error, response));
  return router;
}
export type { ServiceKind, TravelKind };
