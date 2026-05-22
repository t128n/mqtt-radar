import mqtt, { type MqttClient } from "mqtt";
import { EventEmitter } from "node:events";
import type { Logger } from "pino";

export type BrokerConfig = {
  url: string;
  clientId?: string;
  username?: string;
  password?: string;
  ca?: string;
  cert?: string;
  key?: string;
  rejectUnauthorized?: boolean;
};

export type MqttMessage = {
  topic: string;
  payload: string;
};

class BrokerService extends EventEmitter {
  private client: MqttClient | null = null;
  private config: BrokerConfig | null = null;
  private logger: Logger | null = null;

  /** Attach the root pino logger once on startup. */
  setLogger(logger: Logger) {
    this.logger = logger.child({ service: "broker" });
  }

  private get log(): Logger {
    if (!this.logger) throw new Error("BrokerService: logger not initialised");
    return this.logger;
  }

  async connect(config: BrokerConfig): Promise<void> {
    if (this.client) {
      this.log.info(
        { url: this.config?.url },
        "existing connection found — disconnecting before reconnect",
      );
      await this.disconnect();
    }

    this.log.info({ url: config.url, clientId: config.clientId }, "connecting to MQTT broker");

    this.client = await mqtt.connectAsync(config.url, {
      ...(config.clientId !== undefined && { clientId: config.clientId }),
      ...(config.username !== undefined && { username: config.username }),
      ...(config.password !== undefined && { password: config.password }),
      ...(config.ca !== undefined && { ca: config.ca }),
      ...(config.cert !== undefined && { cert: config.cert }),
      ...(config.key !== undefined && { key: config.key }),
      ...(config.rejectUnauthorized !== undefined && { rejectUnauthorized: config.rejectUnauthorized }),
    });

    this.config = config;

    this.log.info({ url: config.url }, "connected to MQTT broker");

    this.client.on("message", (topic, payload) => {
      const msg: MqttMessage = { topic, payload: payload.toString() };
      this.log.debug({ topic, payloadBytes: payload.length }, "mqtt message received");
      this.emit("message", msg);
    });

    this.client.on("error", (err) => {
      this.log.error({ err, url: this.config?.url }, "MQTT client error");
    });

    this.client.on("reconnect", () => {
      this.log.warn({ url: this.config?.url }, "MQTT client reconnecting");
    });

    this.client.on("offline", () => {
      this.log.warn({ url: this.config?.url }, "MQTT client went offline");
    });

    this.client.on("close", () => {
      this.log.info({ url: this.config?.url }, "MQTT client connection closed");
    });

    try {
      await this.client.subscribeAsync("#");
      this.log.info({ url: config.url }, "subscribed to all topics (#)");
    } catch (err: any) {
      this.log.warn(
        { err, url: config.url },
        "Failed to subscribe to root wildcard (#). The broker may restrict wildcard subscriptions. Trying fallback (+/#)...",
      );
      try {
        await this.client.subscribeAsync("+/#");
        this.log.info({ url: config.url }, "subscribed to fallback wildcard (+/#)");
      } catch (fallbackErr: any) {
        this.log.error(
          { err: fallbackErr, url: config.url },
          "Failed to subscribe to fallback wildcard (+/#). Connection remains established, but no active root subscription is running.",
        );
      }
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      this.log.debug("disconnect called but no active client");
      return;
    }
    this.log.info({ url: this.config?.url }, "disconnecting from MQTT broker");
    await this.client.endAsync();
    this.client = null;
    this.config = null;
    this.log.info("disconnected from MQTT broker");
  }

  getStatus(): { connected: false } | { connected: true; url: string; clientId?: string } {
    if (!this.config) return { connected: false };
    return {
      connected: true,
      url: this.config.url,
      ...(this.config.clientId !== undefined && { clientId: this.config.clientId }),
    };
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}

/** Singleton — one MQTT connection shared across the entire process. */
export const brokerService = new BrokerService();
