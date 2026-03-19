import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import type { AppEnv } from "./types.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { requestLogger } from "./middleware/request-logger.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerOwnerRoutes } from "./routes/owners.js";
import { registerAgentRoutes } from "./routes/register.js";
import { registerAgentCrudRoutes } from "./routes/agents.js";
import { registerDiscoverRoutes } from "./routes/discover.js";
import { registerInboxRoutes } from "./routes/inbox.js";
import { registerDelegationRoutes } from "./routes/delegate.js";
import { registerSettlementRoutes } from "./routes/settlement.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { dlpScanner } from "./middleware/dlp-scanner.js";
import { rateLimiter } from "./middleware/rate-limiter.js";

export const app = new OpenAPIHono<AppEnv>();

// Global middleware
app.use("*", requestLogger);

// DLP scanner on all API mutation routes (before any inbox delivery)
app.use("/api/v1/delegate", dlpScanner);
app.use("/api/v1/delegate/*", dlpScanner);
app.use("/api/v1/agents/*/capabilities", dlpScanner);

// Rate limiter on API routes
app.use("/api/v1/*", rateLimiter);

// Global error handler
app.onError((err, c) => {
  const statusCode =
    "statusCode" in err && typeof err.statusCode === "number"
      ? err.statusCode
      : 500;
  const code =
    "code" in err && typeof err.code === "string" ? err.code : "INTERNAL_ERROR";
  const details = "details" in err ? err.details : undefined;

  if (statusCode >= 500) {
    logger.error({ err, path: c.req.path }, "unhandled error");
  }

  return c.json(
    {
      error: {
        code,
        message: err.message,
        ...(details !== undefined && { details }),
      },
    },
    statusCode as 400
  );
});

// Register API routes
registerHealthRoutes(app);
registerOwnerRoutes(app);
registerAgentRoutes(app);
registerAgentCrudRoutes(app);
registerDiscoverRoutes(app);
registerInboxRoutes(app);
registerDelegationRoutes(app);
registerSettlementRoutes(app);
registerSyncRoutes(app);

// OpenAPI spec endpoint
app.doc("/api/v1/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "DelegateOS Network Hub",
    version: "0.1.0",
    description:
      "Agent capability mesh for registration, delegation, discovery, and settlement.",
  },
  servers: [{ url: config.HUB_URL }],
});

// Scalar API reference at /docs
app.get(
  "/docs",
  apiReference({
    spec: {
      url: "/api/v1/openapi.json",
    },
    theme: "kepler",
    pageTitle: "DelegateOS Hub API",
  })
);

// Serve static files from public directory
app.use(
  "/styles/*",
  serveStatic({ root: "./src/public" })
);
app.use(
  "/.well-known/*",
  serveStatic({ root: "./src/public" })
);
app.get("/llms.txt", serveStatic({ path: "./src/public/llms.txt" }));
app.get("/agent-setup", serveStatic({ path: "./src/public/agent-setup.html" }));
app.get("/", serveStatic({ path: "./src/public/index.html" }));

// Start server
if (process.env.NODE_ENV !== "test") {
  // Try to connect to Redis (non-blocking; server starts either way)
  import("./services/redis.js").then(({ tryConnectRedis }) => {
    tryConnectRedis().catch(() => {
      logger.warn("Redis not available; running with PostgreSQL-only fallbacks");
    });
  });

  serve(
    {
      fetch: app.fetch,
      port: config.PORT,
    },
    (info) => {
      logger.info(
        { port: info.port, env: config.NODE_ENV },
        "DelegateOS Hub started"
      );
    }
  );
}
