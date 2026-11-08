import { startServer } from "./server";
import { logger } from "./logger";

const log = logger("main");

startServer().catch((err) => {
  log.error("шлюз не запустился", err);
  process.exit(1);
});
