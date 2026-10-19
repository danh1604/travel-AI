import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { answerAssistant, assistantInput } from "./service.js";
export function createAssistantRouter(answer = answerAssistant) {
  const router = Router(); let active = 0;
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.post("/chat", rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { code: "assistant_rate_limit" } }), async (request, response) => {
    if (request.get("Origin") !== new URL(env.CLIENT_ORIGIN).origin) { response.status(403).json({ code: "invalid_origin" }); return; }
    if (!request.is("application/json")) { response.status(415).json({ code: "json_required" }); return; }
    const input = assistantInput.safeParse(request.body);
    if (!input.success) { response.status(400).json({ code: "invalid_chat_request" }); return; }
    if (active >= 4) { response.status(429).json({ code: "assistant_busy" }); return; }
    active++;
    const controller = new AbortController();
    const close = () => { if (!response.writableEnded) controller.abort(); };
    response.on("close", close);
    try {
      const data = await answer(input.data, AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]));
      if (!controller.signal.aborted) response.json({ data });
    } finally { active--; response.off("close", close); }
  });
  router.use((_error: unknown, _request: import("express").Request, response: import("express").Response, _next: import("express").NextFunction) => response.status(503).json({ code: "assistant_unavailable" }));
  return router;
}
