import { parse } from "@bomb.sh/args";

const args = parse(process.argv.slice(2), {
  string: ["host", "log-level"],
  boolean: ["open", "no-open"],
  alias: {
    p: "port",
    h: "host",
    l: "log-level",
  },
  default: {
    host: "127.0.0.1",
    "log-level": process.env.LOG_LEVEL ?? "info",
    open: true,
  },
});

// Helper to safely parse numbers with a default fallback
function parseNumber(value: unknown, defaultValue: number): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

const port = args.port !== undefined ? Number(args.port) : undefined;
const openBrowser = args.open !== false && !args["no-open"];

export const config = {
  port,
  host: String(args.host),
  logLevel: String(args["log-level"]),
  openBrowser,
  batchWindow: parseNumber(args["batch-window"], 100),
  batchLimit: parseNumber(args["batch-limit"], 100),
  backpressureLimit: parseNumber(args["backpressure-limit"], 500),
};
