import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { PlannerAIError } from "@pickyourway/ai-services";
import { env } from "../config/env.js";
import { readToken, tokenDigest } from "../auth/router.js";
import { getAuthRepository } from "../auth/repository.js";
import type { AuthRepository } from "../auth/types.js";
import { CatalogUnavailable } from "../catalog/repository.js";
import { plannerRequest } from "./contracts.js";
import { generatePlan } from "./service.js";

export function createPlannerRouter(generate = generatePlan, auth: () => Promise<AuthRepository> = getAuthRepository) {
  const router = Router(), activeUsers = new Set<string>();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.get("/status", (_request, response) => response.json({ aiConfigured: Boolean(env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL), weatherConfigured: Boolean(env.WEATHER_API_KEY) }));
  const limit = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { code: "planner_rate_limit" } });
  router.post("/generate", limit, async (request, response) => {
    if (request.get("Origin") !== new URL(env.CLIENT_ORIGIN).origin) { response.status(403).json({ code: "invalid_origin" }); return; }
    if (!request.is("application/json")) { response.status(415).json({ code: "json_required" }); return; }
    const token = readToken(request);
    const user = token ? await (await auth()).findSession(tokenDigest(token), new Date()) : null;
    if (!user) { response.status(401).json({ code: "login_required" }); return; }
    const input = plannerRequest.safeParse(request.body);
    if (!input.success) { response.status(400).json({ code: "invalid_planner_request" }); return; }
    if (activeUsers.has(user.id) || activeUsers.size >= 4) { response.status(429).json({ code: "planner_busy" }); return; }
    const controller = new AbortController();
    const disconnected = () => { if (!response.writableEnded) controller.abort(); };
    response.on("close", disconnected);
    activeUsers.add(user.id);
    const streaming = request.get("Accept")?.includes("text/event-stream") ?? false;
    const emit = (event: unknown) => { if (!controller.signal.aborted && !response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`); };
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    if (streaming) {
      response.set({ "Content-Type": "text/event-stream; charset=utf-8", "X-Accel-Buffering": "no", "Cache-Control": "no-store" });
      response.flushHeaders();
      heartbeat = setInterval(() => { if (!controller.signal.aborted && !response.writableEnded) response.write(": keep-alive\n\n"); }, 15_000);
    }
    try {
      const data = await generate(input.data, AbortSignal.any([controller.signal, AbortSignal.timeout(100_000)]), streaming ? (stage) => emit({ type: "progress", stage }) : undefined);
      if (!controller.signal.aborted) {
        if (data.status === "ready") {
          if (streaming) emit({ type: "progress", stage: "saving" });
          const draftId = await (await auth()).createPlanDraft(user.id, data);
          const result = { ...data, draftId };
          if (streaming) { emit({ type: "result", data: result }); response.end(); } else response.json({ data: result });
        } else if (streaming) { emit({ type: "result", data }); response.end(); } else response.json({ data });
      }
    } catch (error) {
      if (!streaming) throw error;
      const code = error instanceof PlannerAIError ? error.code : error instanceof CatalogUnavailable ? "catalog_unavailable" : "planner_unavailable";
      emit({ type: "error", code }); response.end();
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      activeUsers.delete(user.id);
      response.off("close", disconnected);
    }
  });
  router.use((error: unknown, _request: import("express").Request, response: import("express").Response, _next: import("express").NextFunction) => {
    const code = error instanceof PlannerAIError ? error.code : error instanceof CatalogUnavailable ? "catalog_unavailable" : "planner_unavailable";
    response.status(code === "ai_invalid_output" ? 502 : 503).json({ code });
  });
  return router;
}
