import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { brokerService, type MqttMessage } from "~/services/broker.js";
import type { AppEnv } from "~/types";
import { isAllowedOrigin } from "~/utils/cors";

export const eventRoutes = new Hono<AppEnv>()
  /**
   * GET /api/events
   * Server-Sent Events stream. Returns discovered topics and message data.
   *
   * Query params:
   *   filter: Topic path filter (e.g., "iot/plc"). Defaults to "#".
   *
   * Event formats:
   *   event: "topic"
   *   data: { "topic": "..." }
   *
   *   event: "message"
   *   data: { "topic": "...", "payload": "..." }
   */
  .get("/", async (c) => {
    const filter = c.req.query("filter") || "#";
    const log = c.var.logger.child({ handler: "GET /api/events", filter });

    log.info("SSE client connecting");

    // Manually set CORS headers for SSE stream to bypass Hono middleware header-locking issues
    const origin = c.req.header("Origin");
    if (isAllowedOrigin(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
    }
    c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Dynamically update the backend data client subscription to match requested filter
    try {
      await brokerService.updateDataSubscription(filter);
    } catch (err) {
      log.error({ err }, "failed to update data subscription on connect");
    }

    return streamSSE(c, async (stream) => {
      let messageCount = 0;
      let isAborted = false;

      type SSEEvent = 
        | { type: "topic"; topic: string }
        | { type: "message"; msg: MqttMessage };

      const queue: SSEEvent[] = [];
      let resolveQueue: (() => void) | null = null;

      const topicHandler = (topic: string) => {
        log.debug({ topic }, "queuing discovered topic event");
        queue.push({ type: "topic", topic });
        if (queue.length > 300) {
          queue.shift(); // Drop oldest event to enforce backpressure
        }
        if (resolveQueue) {
          resolveQueue();
          resolveQueue = null;
        }
      };

      const messageHandler = (msg: MqttMessage) => {
        queue.push({ type: "message", msg });
        if (queue.length > 300) {
          queue.shift(); // Drop oldest event to enforce backpressure
        }
        if (resolveQueue) {
          resolveQueue();
          resolveQueue = null;
        }
      };

      const disconnectHandler = () => {
        log.info("broker disconnected; closing SSE stream");
        isAborted = true;
        if (resolveQueue) {
          resolveQueue();
          resolveQueue = null;
        }
      };

      try {
        brokerService.on("topic", topicHandler);
        brokerService.on("message", messageHandler);
        brokerService.on("disconnect", disconnectHandler);

        stream.onAbort(() => {
          isAborted = true;
          if (resolveQueue) {
            resolveQueue();
            resolveQueue = null;
          }
          log.info({ messageCount }, "SSE client disconnected");
        });

        // Send an initial ping so the client knows the stream is open
        log.debug("sending SSE ping");
        try {
          await stream.writeSSE({ event: "ping", data: JSON.stringify({ ts: Date.now() }) });
        } catch (err) {
          log.error({ err }, "failed to write initial SSE ping");
          isAborted = true;
        }

        let lastPingTime = Date.now();

        while (!isAborted) {
          if (queue.length === 0) {
            // Wait for either a new message or next ping (interval: 3000ms)
            const timeToNextPing = Math.max(0, 3000 - (Date.now() - lastPingTime));
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            await Promise.race([
              new Promise<void>((resolve) => {
                resolveQueue = resolve;
              }),
              new Promise<void>((resolve) => {
                timeoutId = setTimeout(() => {
                  resolve();
                }, timeToNextPing);
              })
            ]);

            if (timeoutId) clearTimeout(timeoutId);
          }

          if (isAborted) break;

          // 1. Process queued messages sequentially
          while (queue.length > 0 && !isAborted) {
            const event = queue.shift()!;
            try {
              if (event.type === "topic") {
                await stream.writeSSE({
                  event: "topic",
                  data: JSON.stringify({ topic: event.topic }),
                });
              } else if (event.type === "message") {
                messageCount++;
                await stream.writeSSE({
                  event: "message",
                  data: JSON.stringify(event.msg),
                  id: String(messageCount),
                });
              }
            } catch (writeErr) {
              log.error({ writeErr }, "Failed to write event to SSE client; closing stream");
              isAborted = true;
              break;
            }
          }

          // 2. Heartbeat check
          if (Date.now() - lastPingTime >= 3000 && !isAborted) {
            try {
              await stream.writeSSE({ event: "ping", data: JSON.stringify({ ts: Date.now() }) });
              lastPingTime = Date.now();
            } catch (pingErr) {
              log.error({ pingErr }, "Failed to write ping to SSE client; closing stream");
              isAborted = true;
              break;
            }
          }
        }
      } finally {
        log.info({ messageCount }, "cleaning up SSE stream event listeners");
        brokerService.off("topic", topicHandler);
        brokerService.off("message", messageHandler);
        brokerService.off("disconnect", disconnectHandler);
      }
    });
  });
