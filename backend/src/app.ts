import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use(helmet());
app.use(cors({ origin: new URL(env.CLIENT_ORIGIN).origin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", apiRouter);
app.use((_request, response) => response.status(404).json({ error: "Not found" }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status = error instanceof SyntaxError && "body" in error ? 400 : 500;
  if (status === 500) console.error(error instanceof Error ? error.message : "Unexpected server error");
  response.status(status).json({ error: status === 400 ? "Invalid JSON" : "Internal server error" });
});
