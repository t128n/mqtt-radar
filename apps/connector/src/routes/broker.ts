import { Hono } from "hono";
import { brokerService, type BrokerConfig } from "~/services/broker";
import type { AppEnv } from "~/types";
import { mapBrokerError } from "~/utils/error-mapper";

export const brokerRoutes = new Hono<AppEnv>()
  /**
   * POST /api/broker
   * Connect (or reconnect) to an MQTT broker.
   * Body: { url: string, clientId?: string, username?: string, password?: string }
   */
  .post("/", async (c) => {
    const log = c.var.logger.child({ handler: "POST /api/broker" });

    let body: BrokerConfig;
    try {
      body = await c.req.json<BrokerConfig>();
    } catch {
      log.warn("invalid JSON body");
      return c.json({ error: "invalid JSON body" }, 400);
    }

    if (!body.url) {
      log.warn("missing required field: url");
      return c.json({ error: "url is required" }, 422);
    }

    log.info({ url: body.url, clientId: body.clientId }, "broker connect requested");

    try {
      await brokerService.connect(body);
      log.info({ url: body.url }, "broker connected successfully");
      return c.json({ ok: true, status: brokerService.getStatus() }, 201);
    } catch (err) {
      log.error({ err, url: body.url }, "failed to connect to broker");
      return c.json({ error: "failed to connect", detail: mapBrokerError(err) }, 502);
    }
  })

  /**
   * GET /api/broker
   * Return current broker connection details (replaces /api/status).
   */
  .get("/", (c) => {
    const log = c.var.logger.child({ handler: "GET /api/broker" });
    const status = brokerService.getStatus();
    log.debug({ status }, "broker status requested");
    return c.json(status);
  })

  /**
   * DELETE /api/broker
   * Disconnect from the current broker.
   */
  .delete("/", async (c) => {
    const log = c.var.logger.child({ handler: "DELETE /api/broker" });

    if (!brokerService.isConnected()) {
      log.info("disconnect requested but no active connection");
      return c.json({ ok: true, message: "no active connection" });
    }

    try {
      await brokerService.disconnect();
      log.info("broker disconnected successfully");
      return c.json({ ok: true });
    } catch (err) {
      log.error({ err }, "failed to disconnect from broker");
      return c.json({ error: "failed to disconnect", detail: String(err) }, 500);
    }
  });
