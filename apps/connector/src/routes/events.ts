import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { brokerService, type MqttMessage } from "~/services/broker.js";
import type { AppEnv } from "~/types";
import { isAllowedOrigin } from "~/utils/cors";
import { vValidator } from "@hono/valibot-validator";
import * as v from "valibot";
import { config } from "~/services/config.js";

const eventsQuerySchema = v.object({
  filter: v.optional(v.string("filter must be a string")),
});

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
  .get(
    "/",
    vValidator("query", eventsQuerySchema, (result, c: Context<AppEnv>) => {
      if (!result.success) {
        const log = c.var.logger.child({ handler: "GET /api/events" });
        log.warn({ issues: result.issues }, "validation failed");
        return c.json({ error: result.issues[0].message || "Invalid query parameters" }, 400);
      }
      return;
    }),
    async (c) => {
      const { filter = "#" } = c.req.valid("query");
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

      const BATCH_WINDOW_MS = config.batchWindow;
      const BATCH_SIZE_LIMIT = config.batchLimit;

      return streamSSE(c, async (stream) => {
        let messageCount = 0;
        let isAborted = false;

        type SSEEvent = { type: "topic"; topic: string } | { type: "message"; msg: MqttMessage };

        const queue: SSEEvent[] = [];
        let resolveQueue: (() => void) | null = null;
        let lastSentTime = 0;
        let flushTimer: ReturnType<typeof setTimeout> | null = null;

        const triggerFlush = () => {
          if (resolveQueue) {
            resolveQueue();
            resolveQueue = null;
          }
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
        };

        const queueAndSchedule = (event: SSEEvent) => {
          queue.push(event);
          if (queue.length > config.backpressureLimit) {
            queue.shift(); // Enforce hard backpressure to prevent memory bloat
          }

          const now = Date.now();

          // If we reach the batch limit size, flush immediately
          if (queue.length >= BATCH_SIZE_LIMIT) {
            triggerFlush();
            return;
          }

          const timeSinceLastSent = now - lastSentTime;
          if (timeSinceLastSent < BATCH_WINDOW_MS) {
            // If we recently sent a message, enter batching mode and delay
            if (!flushTimer) {
              const delay = BATCH_WINDOW_MS - timeSinceLastSent;
              flushTimer = setTimeout(triggerFlush, delay);
            }
          } else {
            // No recent sends, deliver immediately for low latency
            triggerFlush();
          }
        };

        const topicHandler = (topic: string) => {
          log.debug({ topic }, "queuing discovered topic event");
          queueAndSchedule({ type: "topic", topic });
        };

        const messageHandler = (msg: MqttMessage) => {
          queueAndSchedule({ type: "message", msg });
        };

        const disconnectHandler = () => {
          log.info("broker disconnected; closing SSE stream");
          stream.writeSSE({ event: "disconnect", data: "{}" }).catch(() => {});
          isAborted = true;
          triggerFlush();
        };

        try {
          brokerService.on("topic", topicHandler);
          brokerService.on("message", messageHandler);
          brokerService.on("disconnect", disconnectHandler);

          stream.onAbort(() => {
            isAborted = true;
            triggerFlush();
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

          if (!brokerService.isConnected() && !isAborted) {
            log.warn("broker is not connected; aborting SSE connection immediately");
            try {
              await stream.writeSSE({ event: "disconnect", data: "{}" });
            } catch {}
            isAborted = true;
          }

          // Send previously discovered topics immediately to populate client's topic tree
          const retainedTopics = brokerService.getDiscoveredTopics();
          if (retainedTopics.length > 0 && !isAborted) {
            log.info({ count: retainedTopics.length }, "sending retained topics to new SSE client");
            const topicEvents = retainedTopics.map((topic) => ({ type: "topic" as const, topic }));
            try {
              await stream.writeSSE({
                event: "batch",
                data: JSON.stringify(topicEvents),
              });
            } catch (err) {
              log.error({ err }, "failed to write retained topics to SSE client");
              isAborted = true;
            }
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
                }),
              ]);

              if (timeoutId) clearTimeout(timeoutId);
            }

            if (isAborted) break;

            // 1. Process queued messages in adaptive batches
            if (queue.length > 0) {
              const batch = queue.splice(0, queue.length);
              lastSentTime = Date.now();
              try {
                messageCount += batch.length;
                await stream.writeSSE({
                  event: "batch",
                  data: JSON.stringify(batch),
                  id: String(messageCount),
                });
              } catch (writeErr) {
                log.error({ writeErr }, "Failed to write batch to SSE client; closing stream");
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
          log.info({ messageCount }, "cleaning up SSE stream event listeners and timers");
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          brokerService.off("topic", topicHandler);
          brokerService.off("message", messageHandler);
          brokerService.off("disconnect", disconnectHandler);
        }
      });
    },
  );
