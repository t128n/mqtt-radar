import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { brokerService, type MqttMessage } from "~/services/broker.js";
import type { AppEnv } from "~/types";

export const eventRoutes = new Hono<AppEnv>()
  /**
   * GET /api/events
   * Server-Sent Events stream. Each MQTT message received by the broker
   * connection is forwarded as an SSE event to all connected clients.
   *
   * Event format:
   *   data: { "topic": "...", "payload": "..." }
   */
  .get("/", (c) => {
    const log = c.var.logger.child({ handler: "GET /api/events" });

    log.info("SSE client connected");

    // Manually set CORS headers for SSE stream to bypass onion middleware header-locking issues
    const origin = c.req.header("Origin");
    c.header("Access-Control-Allow-Origin", origin || "*");
    c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return streamSSE(c, async (stream) => {
      let messageCount = 0;

      const handler = (msg: MqttMessage) => {
        messageCount++;
        log.debug({ topic: msg.topic, messageCount }, "forwarding mqtt message to SSE client");
        stream.writeSSE({
          event: "message",
          data: JSON.stringify(msg),
          id: String(messageCount),
        });
      };

      brokerService.on("message", handler);

      stream.onAbort(() => {
        brokerService.off("message", handler);
        log.info({ messageCount }, "SSE client disconnected");
      });

      // Send an initial ping so the client knows the stream is open
      log.debug("sending SSE ping");
      await stream.writeSSE({ event: "ping", data: JSON.stringify({ ts: Date.now() }) });

      // Keep the stream alive with a periodic heartbeat until the client disconnects
      while (true) {
        await stream.sleep(3000);
        await stream.writeSSE({ event: "ping", data: JSON.stringify({ ts: Date.now() }) });
      }
    });
  });
