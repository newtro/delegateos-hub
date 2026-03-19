import { logger } from "./logger.js";

/**
 * BullMQ worker process.
 * Handles background jobs: message expiry cleanup, trust score aggregation, etc.
 * Runs as a separate Fly.io process group.
 */

logger.info("DelegateOS Worker starting...");

// Worker will be expanded as background job types are added.
// For now, it runs a periodic cleanup loop.

async function runCleanupCycle(): Promise<void> {
  // Future: expire old inbox messages, aggregate trust scores, etc.
  logger.debug("Cleanup cycle complete");
}

// Run cleanup every 60 seconds
const CLEANUP_INTERVAL_MS = 60_000;

async function main() {
  logger.info("DelegateOS Worker started");

  const interval = setInterval(runCleanupCycle, CLEANUP_INTERVAL_MS);

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Worker shutting down...");
    clearInterval(interval);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
