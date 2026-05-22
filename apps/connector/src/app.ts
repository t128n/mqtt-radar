import { getPort } from "get-port-please";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { structuredLogger } from "@hono/structured-logger";
import pino from "pino";
import pretty from "pino-pretty";
import type { AppEnv } from "~/types";
import { brokerService } from "~/services/broker";
import { brokerRoutes } from "~/routes/broker";
import { eventRoutes } from "~/routes/events";
import { cors } from "hono/cors";
import { isAllowedOrigin } from "~/utils/cors";
import { isDevelopment } from "std-env";
import { config } from "~/services/config";

async function main() {
  let port: number;
  if (config.port !== undefined) {
    port = config.port;
  } else {
    port = await getPort({ port: 3881, portRange: [3881, 3900], name: "mqtt-radar-connector" });
  }

  const rootLogger = pino(
    {
      level: config.logLevel,
    },
    pretty({
      colorize: true,
    }),
  );

  // Give the broker service access to the root logger so its
  // internal pino child logs flow through the same pipeline.
  brokerService.setLogger(rootLogger);

  const app = new Hono<AppEnv>();

  app.use(requestId());

  app.use(
    structuredLogger({
      createLogger: (c) =>
        rootLogger.child({
          requestId: c.var.requestId,
        }),
    }),
  );

  // CORS middleware - restrict to allowed origins
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (isAllowedOrigin(origin)) {
          return origin;
        }
        return undefined;
      },
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      credentials: false,
    }),
  );

  // Public health endpoint
  app.get("/api/health", (c) => {
    return c.json({
      name: "mqtt-radar-connector",
      status: "ok",
    });
  });

  // Routes
  app.route("/api/broker", brokerRoutes);
  app.route("/api/events", eventRoutes);

  // Unmatched routes
  app.notFound((c) => {
    c.var.logger.warn({ path: c.req.path, method: c.req.method }, "route not found");
    return c.json({ error: "not found" }, 404);
  });

  app.onError((err, c) => {
    c.var.logger.error({ err, path: c.req.path, method: c.req.method }, "unhandled error");
    return c.json({ error: "internal server error" }, 500);
  });

  // Bind strictly to loopback config.host
  serve({ fetch: app.fetch, port, hostname: config.host }, (info) => {
    const isDev =
      isDevelopment || process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";
    const frontendUrl = isDev ? "http://localhost:5173" : "https://t128n.github.io/mqtt-radar";
    const displayHost = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
    const pairingUrl = `${frontendUrl}/?connector=http://${displayHost}:${info.port}`;

    rootLogger.info(
      {
        port: info.port,
        pairingUrl,
        instructions: "Open the pairingUrl in your browser to automatically pair the frontend.",
      },
      `mqtt-radar-connector listening on ${config.host}`,
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
