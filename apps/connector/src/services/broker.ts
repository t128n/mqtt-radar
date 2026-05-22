import mqtt, { type MqttClient } from "mqtt";
import { EventEmitter } from "node:events";
import type { Logger } from "pino";

export type BrokerConfig = {
  url: string;
  clientId?: string | undefined;
  username?: string | undefined;
  password?: string | undefined;
  ca?: string | undefined;
  cert?: string | undefined;
  key?: string | undefined;
  rejectUnauthorized?: boolean | undefined;
};

export type MqttMessage = {
  topic: string;
  payload: string;
};

function cleanMqttOptions(config: BrokerConfig, clientId: string) {
  const options: Record<string, any> = { clientId };
  if (config.username !== undefined) options.username = config.username;
  if (config.password !== undefined) options.password = config.password;
  if (config.ca !== undefined) options.ca = config.ca;
  if (config.cert !== undefined) options.cert = config.cert;
  if (config.key !== undefined) options.key = config.key;
  if (config.rejectUnauthorized !== undefined)
    options.rejectUnauthorized = config.rejectUnauthorized;
  return options;
}

class BrokerService extends EventEmitter {
  private discoveryClient: MqttClient | null = null;
  private dataClient: MqttClient | null = null;
  private config: BrokerConfig | null = null;
  private logger: Logger | null = null;
  private currentDataFilter: string | null = null;
  private activeDataFilterPatterns: string[] = [];

  /** Attach the root pino logger once on startup. */
  setLogger(logger: Logger) {
    this.logger = logger.child({ service: "broker" });
  }

  private get log(): Logger {
    if (!this.logger) throw new Error("BrokerService: logger not initialised");
    return this.logger;
  }

  private async subscribeWithFallback(client: MqttClient, filter: string): Promise<string> {
    try {
      await client.subscribeAsync(filter);
      this.log.info({ filter }, "subscribed successfully");
      return filter;
    } catch (err: any) {
      if (filter === "#") {
        this.log.warn({ err }, "Failed to subscribe to '#'. Trying fallback '+/#'...");
        await client.subscribeAsync("+/#");
        this.log.info("subscribed successfully to fallback '+/#'");
        return "+/#";
      }
      throw err;
    }
  }

  async connect(config: BrokerConfig): Promise<void> {
    if (this.discoveryClient || this.dataClient) {
      this.log.info(
        { url: this.config?.url },
        "existing connection found — disconnecting before reconnect",
      );
      await this.disconnect();
    }

    this.config = config;
    const baseClientId =
      config.clientId || `mqtt-radar-${Math.random().toString(36).substring(2, 7)}`;
    const discoveryClientId = `${baseClientId}-discovery`;
    const dataClientId = `${baseClientId}-data`;

    this.log.info(
      { url: config.url, discoveryClientId, dataClientId },
      "connecting dual MQTT clients",
    );

    try {
      // 1. Connect and configure the Discovery Client
      this.discoveryClient = await mqtt.connectAsync(
        config.url,
        cleanMqttOptions(config, discoveryClientId),
      );

      this.log.info({ url: config.url }, "discoveryClient connected successfully");

      this.discoveryClient.on("message", (topic) => {
        this.log.debug({ topic }, "discovery message received (extracting topic only)");
        this.emit("topic", topic);
      });

      this.discoveryClient.on("error", (err) => {
        this.log.error({ err, client: "discovery" }, "MQTT client error");
      });

      await this.subscribeWithFallback(this.discoveryClient, "#");

      // 2. Connect and configure the Data Client
      this.dataClient = await mqtt.connectAsync(config.url, cleanMqttOptions(config, dataClientId));

      this.log.info({ url: config.url }, "dataClient connected successfully");

      this.dataClient.on("message", (topic, payload) => {
        const msg: MqttMessage = { topic, payload: payload.toString() };
        this.log.debug({ topic, payloadBytes: payload.length }, "mqtt data message received");
        this.emit("message", msg);
      });

      this.dataClient.on("error", (err) => {
        this.log.error({ err, client: "data" }, "MQTT client error");
      });

      // Subscribe dataClient to the default filter (or whatever was requested)
      const initialFilter = this.currentDataFilter || "#";
      const targetPatterns =
        initialFilter === "#" || initialFilter === "+/#"
          ? [initialFilter]
          : [initialFilter, `${initialFilter}/#`];

      const activePatterns: string[] = [];
      for (const pattern of targetPatterns) {
        const activePattern = await this.subscribeWithFallback(this.dataClient, pattern);
        activePatterns.push(activePattern);
      }
      this.activeDataFilterPatterns = activePatterns;
      this.currentDataFilter = initialFilter;
    } catch (err) {
      this.log.error({ err }, "failed to establish dual MQTT connections");
      await this.disconnect();
      throw err;
    }
  }

  async updateDataSubscription(filter: string): Promise<void> {
    const targetFilter = filter || "#";
    if (this.currentDataFilter === targetFilter) {
      this.log.debug({ filter: targetFilter }, "data filter unchanged, skipping update");
      return;
    }

    const oldPatterns = this.activeDataFilterPatterns;
    this.currentDataFilter = targetFilter;

    if (!this.dataClient) {
      this.log.debug(
        { filter: targetFilter },
        "dataClient not connected yet, storing filter for later",
      );
      return;
    }

    const targetPatterns =
      targetFilter === "#" || targetFilter === "+/#"
        ? [targetFilter]
        : [targetFilter, `${targetFilter}/#`];

    this.log.info(
      { oldPatterns, newFilterPatterns: targetPatterns },
      "updating dataClient subscriptions",
    );

    // Subscribe to new patterns
    const activePatterns: string[] = [];
    for (const pattern of targetPatterns) {
      const activePattern = await this.subscribeWithFallback(this.dataClient, pattern);
      activePatterns.push(activePattern);
    }
    this.activeDataFilterPatterns = activePatterns;

    // Unsubscribe from any old patterns that are not in the new active patterns list
    for (const oldPattern of oldPatterns) {
      if (!activePatterns.includes(oldPattern)) {
        try {
          await this.dataClient.unsubscribeAsync(oldPattern);
          this.log.info({ oldPattern }, "unsubscribed dataClient from old pattern");
        } catch (err) {
          this.log.warn({ err, oldPattern }, "failed to unsubscribe dataClient from old pattern");
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    if (!this.discoveryClient && !this.dataClient) {
      this.log.debug("disconnect called but no active clients");
      return;
    }

    this.log.info({ url: this.config?.url }, "disconnecting dual MQTT clients");

    const disconnects: Promise<void>[] = [];
    if (this.discoveryClient) {
      disconnects.push(this.discoveryClient.endAsync(true));
      this.discoveryClient = null;
    }
    if (this.dataClient) {
      disconnects.push(this.dataClient.endAsync(true));
      this.dataClient = null;
    }

    await Promise.all(disconnects);
    this.config = null;
    this.activeDataFilterPatterns = [];
    this.emit("disconnect");
    this.log.info("disconnected both MQTT clients");
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
    return this.discoveryClient !== null && this.dataClient !== null;
  }
}

/** Singleton — dual MQTT connection shared across the entire process. */
export const brokerService = new BrokerService();
