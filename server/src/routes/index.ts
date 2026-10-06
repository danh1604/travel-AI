import { Router } from "express";

export const apiRouter = Router();
apiRouter.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "pickyourway-server" });
});
