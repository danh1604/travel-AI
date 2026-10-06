import { app } from "./app.js";
import { env } from "./config/env.js";
import { database } from "./config/database.js";

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`PickYourWay API listening on port ${env.PORT}`);
});

function shutdown() {
  server.close(() => { void database.end().then(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
