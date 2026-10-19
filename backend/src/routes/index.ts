import { Router } from "express";
import { getDatabase } from "../config/database.js";
import { createCatalogRouter } from "../catalog/router.js";
import { createAuthRouter } from "../auth/router.js";
import { createAdminCatalogRouter } from "../catalog/admin-router.js";
import { createAccountAdminRouter } from "../auth/account-admin-router.js";
import { createPlannerRouter } from "../planner/router.js";
import { createTripsRouter } from "../trips/router.js";
import { createAssistantRouter } from "../rag/router.js";
import { createReviewsRouter } from "../reviews/router.js";

export const apiRouter = Router();
apiRouter.use("/explore", createCatalogRouter());
apiRouter.use("/planner", createPlannerRouter());
apiRouter.use("/trips", createTripsRouter());
apiRouter.use("/assistant", createAssistantRouter());
apiRouter.use("/reviews", createReviewsRouter());
apiRouter.use("/auth", createAuthRouter());
apiRouter.use("/admin/users", createAccountAdminRouter());
apiRouter.use("/admin", createAdminCatalogRouter());
apiRouter.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "pickyourway-server" });
});

apiRouter.get("/ready", async (_request, response) => {
  try {
    // Check migration and pgvector as well as database connectivity.
    await getDatabase().$queryRaw`SELECT "id" FROM "Destination" LIMIT 1`;
    const extensions = await getDatabase().$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    if (!extensions.length) throw new Error("pgvector is not installed");
    response.json({ status: "ok", database: "ready", vector: "ready" });
  } catch {
    response.status(503).json({ status: "unavailable", database: "not ready" });
  }
});
