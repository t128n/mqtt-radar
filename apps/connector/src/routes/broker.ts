import { Hono } from "hono";
import { brokerService, type BrokerConfig } from "~/services/broker";
import type { AppEnv } from "~/types";
import { mapBrokerError } from "~/utils/error-mapper";
import { vValidator } from "@hono/valibot-validator";
import * as v from "valibot";

const brokerConfigSchema = v.object({
  url: v.pipe(
    v.string("url must be a string"),
    v.check((val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, "Invalid URL format")
  ),
  clientId: v.optional(v.string("clientId must be a string")),
  username: v.optional(v.string("username must be a string")),
  password: v.optional(v.string("password must be a string")),
  ca: v.optional(v.string("ca must be a string")),
  cert: v.optional(v.string("cert must be a string")),
  key: v.optional(v.string("key must be a string")),
  rejectUnauthorized: v.optional(v.boolean("rejectUnauthorized must be a boolean")),
});

export const brokerRoutes = new Hono<AppEnv>()
  /**
   * POST /api/broker
   * Connect (or reconnect) to an MQTT broker.
   * Body: { url: string, clientId?: string, username?: string, password?: string }
   */
  .post(
    "/",
    vValidator(
      "json",
      brokerConfigSchema,
      (result, c) => {
        const log = c.var.logger.child({ handler: "POST /api/broker" });
        if (!result.success) {
          log.warn({ issues: result.issues }, "validation failed");

          const urlIssue = result.issues.find((issue) => issue.path?.[0]?.key === "url");
          if (urlIssue) {
            const inputVal = urlIssue.input;
            if (inputVal === undefined || inputVal === null || inputVal === "") {
              return c.json({ error: "url is required" }, 422);
            }
            return c.json({ error: urlIssue.message || "Invalid URL format" }, 400);
          }

          return c.json({ error: result.issues[0].message || "Invalid request parameters" }, 400);
        }
      }
    ),
    async (c) => {
      const log = c.var.logger.child({ handler: "POST /api/broker" });
      const body = c.req.valid("json");

      log.info({ url: body.url, clientId: body.clientId }, "broker connect requested");

      try {
        await brokerService.connect(body);
        log.info({ url: body.url }, "broker connected successfully");
        return c.json({ ok: true, status: brokerService.getStatus() }, 201);
      } catch (err) {
        log.error({ err, url: body.url }, "failed to connect to broker");
        return c.json({ error: "failed to connect", detail: mapBrokerError(err) }, 502);
      }
    }
  )

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
