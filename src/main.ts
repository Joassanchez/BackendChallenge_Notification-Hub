import { createApp } from "./app.js";
import { env } from "./shared/config/env.js";
import type { RetryScheduler } from "./modules/delivery/retry/retry-scheduler.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Notification Hub API listening on port ${env.PORT}`);
});

const gracefulShutdown = () => {
  const scheduler = (app.locals as Record<string, unknown>).scheduler as RetryScheduler | undefined;
  scheduler?.stop();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
