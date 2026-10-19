import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { getAuthRepository } from "../auth/repository.js";
import { readToken, tokenDigest } from "../auth/router.js";
import type { AuthRepository } from "../auth/types.js";
import {
  categoryInput,
  categoryUpdate,
  tourInput,
  tourUpdate,
  CatalogWriteError,
  type AdminCatalogRepository,
} from "./admin-contracts.js";
import { getAdminCatalog } from "./repository.js";
import { tourContentInput } from "./content-contracts.js";
import { departureInput, departureArchive } from "./departure-contracts.js";

export function createAdminCatalogRouter(
  repository: () => AdminCatalogRepository = getAdminCatalog,
  auth: () => Promise<AuthRepository> = getAuthRepository,
) {
  const router = Router();
  router.use(async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    const token = readToken(request);
    const user = token
      ? await (await auth()).findSession(tokenDigest(token), new Date())
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
    next();
  });
  router.get("/catalog", async (_request, response) => {
    response.json(await repository().list());
  });
  router.get("/tours/:id/departures", async (request, response) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ code: "invalid_departure" });
      return;
    }
    response.json({ data: await repository().getDepartures(id.data) });
  });
  router.post(
    "/tours/:id/departures/:departureId/close",
    async (request, response) => {
      const id = z.string().uuid().safeParse(request.params.id),
        departureId = z.string().uuid().safeParse(request.params.departureId),
        input = departureArchive.safeParse(request.body);
      if (!id.success || !departureId.success || !input.success) {
        response.status(400).json({ code: "invalid_departure" });
        return;
      }
      response.json({
        data: await repository().closeDeparture(
          id.data,
          departureId.data,
          input.data.revision,
        ),
      });
    },
  );
  for (const method of ["post", "patch"] as const) {
    router[method](
      `/tours/:id/departures${method === "patch" ? "/:departureId" : ""}`,
      async (request, response) => {
        const id = z.string().uuid().safeParse(request.params.id),
          input = departureInput.safeParse(request.body);
        const departureId =
          method === "patch"
            ? z
                .string()
                .uuid()
                .safeParse(
                  "departureId" in request.params
                    ? request.params.departureId
                    : undefined,
                )
            : undefined;
        if (!id.success || !input.success || departureId?.success === false) {
          response.status(400).json({ code: "invalid_departure" });
          return;
        }
        response.status(method === "post" ? 201 : 200).json({
          data: await repository().saveDeparture(
            id.data,
            input.data,
            departureId?.data,
          ),
        });
      },
    );
  }
  router.delete(
    "/tours/:id/departures/:departureId",
    async (request, response) => {
      const id = z.string().uuid().safeParse(request.params.id),
        departureId = z.string().uuid().safeParse(request.params.departureId),
        input = departureArchive.safeParse(request.body);
      if (!id.success || !departureId.success || !input.success) {
        response.status(400).json({ code: "invalid_departure" });
        return;
      }
      response.json({
        data: await repository().archiveDeparture(
          id.data,
          departureId.data,
          input.data.revision,
        ),
      });
    },
  );
  router.get("/tours/:id/content", async (request, response) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ code: "invalid_input" });
      return;
    }
    response.json({ data: await repository().getContent(id.data) });
  });
  router.put("/tours/:id/content", async (request, response) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = tourContentInput.safeParse(request.body);
    if (!id.success || !parsed.success) {
      response.status(400).json({ code: "invalid_content" });
      return;
    }
    response.json({
      data: await repository().saveContent(id.data, parsed.data),
    });
  });
  for (const kind of ["categories", "tours"] as const) {
    router.post(`/${kind}`, async (request, response) => {
      const schema = kind === "categories" ? categoryInput : tourInput;
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ code: "invalid_input" });
        return;
      }
      const saved =
        kind === "categories"
          ? await repository().saveCategory(categoryInput.parse(parsed.data))
          : await repository().saveTour(tourInput.parse(parsed.data));
      response.status(201).json({ data: saved });
    });
    router.patch(`/${kind}/:id`, async (request, response) => {
      const id = z.string().uuid().safeParse(request.params.id);
      const parsed = (
        kind === "categories" ? categoryUpdate : tourUpdate
      ).safeParse(request.body);
      if (!id.success || !parsed.success) {
        response.status(400).json({ code: "invalid_input" });
        return;
      }
      const { revision, ...input } = parsed.data;
      const saved =
        kind === "categories"
          ? await repository().saveCategory(
              categoryInput.parse(input),
              id.data,
              revision,
            )
          : await repository().saveTour(
              tourInput.parse(input),
              id.data,
              revision,
            );
      response.json({ data: saved });
    });
  }
  router.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof CatalogWriteError) {
        response.status(error.status).json({ code: error.code });
        return;
      }
      console.warn(
        "Admin catalog request failed:",
        error instanceof Error ? error.name : "unknown error",
      );
      response.status(503).json({ code: "catalog_unavailable" });
    },
  );
  return router;
}
