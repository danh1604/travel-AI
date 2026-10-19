import { app } from "./app.js";
import { env } from "./config/env.js";
import { disconnectDatabase } from "./config/database.js";
import { closeAuthRepository } from "./auth/repository.js";

const server = app.listen(env.PORT, () => {
  console.log(`PickYourWay API listening on port ${env.PORT}`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    void Promise.all([closeAuthRepository(), disconnectDatabase()]).then(() => process.exit(0)).catch(() => process.exit(1));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
