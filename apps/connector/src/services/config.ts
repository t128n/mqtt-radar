import { parse } from "@bomb.sh/args";

const args = parse(process.argv.slice(2), {
  string: ["host", "log-level"],
  boolean: ["help"],
  alias: {
    p: "port",
    h: "host",
    l: "log-level",
  },
  default: {
    host: "127.0.0.1",
    "log-level": process.env.LOG_LEVEL ?? "info",
  },
});

if (args.help || args._.includes("help")) {
  console.log(`MQTT Radar Connector 📡

Usage:
  npx github:t128n/mqtt-radar [options]

Options:
  -p, --port <number>              Connector HTTP server port (default: 3881, auto-selects 3881-3900 if occupied)
  -h, --host <string>              Loopback host address to bind the connector to (default: 127.0.0.1)
  -l, --log-level <string>         Logging verbosity (trace, debug, info, warn, error) (default: info)
  --batch-window <number>          Buffer window duration in ms for outbound SSE events (default: 100)
  --batch-limit <number>           Maximum number of buffered events in a single SSE push (default: 100)
  --backpressure-limit <number>    Maximum number of queued SSE events in memory before dropping (default: 500)
  --help                           Show this help menu`);
  process.exit(0);
}

// Helper to safely parse numbers with a default fallback
function parseNumber(value: unknown, defaultValue: number): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

const port = args.port !== undefined ? Number(args.port) : undefined;

export const config = {
  port,
  host: String(args.host),
  logLevel: String(args["log-level"]),
  batchWindow: parseNumber(args["batch-window"], 100),
  batchLimit: parseNumber(args["batch-limit"], 100),
  backpressureLimit: parseNumber(args["backpressure-limit"], 500),
};
