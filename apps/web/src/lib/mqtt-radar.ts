import { ofetch } from "ofetch";

const CONNECTOR_PORT_START = 3881;
const CONNECTOR_PORT_COUNT = 20;

function getConnectorOrigin(port: number): string {
  return `http://localhost:${port}`;
}

export function createConnectorClient(origin: string) {
  return ofetch.create({
    baseURL: origin,
    retry: 0,
    timeout: 30_000,
  });
}

/**
 * Checks URL search parameters for "connector" value.
 * If found, stores it in localStorage and removes it from the browser URL bar.
 * Returns the currently active connector origin.
 */
export function handlePairing(): { origin: string | null } {
  if (typeof window === "undefined") {
    return { origin: null };
  }

  const params = new URLSearchParams(window.location.search);
  let connector = params.get("connector");

  if (connector) {
    if (connector.startsWith("http://localhost:")) {
      connector = connector.replace("http://localhost:", "http://127.0.0.1:");
    }
    localStorage.setItem("mqtt_radar_connector_origin", connector);

    // Clean up the URL search params so the param doesn't linger in the address bar
    const url = new URL(window.location.href);
    url.searchParams.delete("connector");
    window.history.replaceState({}, document.title, url.pathname + url.search);
  }

  let origin = localStorage.getItem("mqtt_radar_connector_origin");
  if (origin && origin.startsWith("http://localhost:")) {
    origin = origin.replace("http://localhost:", "http://127.0.0.1:");
    localStorage.setItem("mqtt_radar_connector_origin", origin);
  }

  return {
    origin,
  };
}

/**
 * Verifies if the saved origin is valid by performing a test request to /api/broker.
 */
export async function verifyPairing(origin: string): Promise<boolean> {
  try {
    const client = createConnectorClient(origin);
    await client("/api/broker", { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

async function canReachConnector(port: number): Promise<boolean> {
  try {
    const res = await ofetch<{ status: string }>("/api/health", {
      baseURL: getConnectorOrigin(port),
      method: "GET",
      retry: 0,
      timeout: 500,
    });

    return res?.status === "ok";
  } catch {
    return false;
  }
}

export async function findConnectorOrigin(): Promise<string | null> {
  const ports = Array.from(
    { length: CONNECTOR_PORT_COUNT },
    (_, i) => CONNECTOR_PORT_START + i,
  );

  const checks = ports.map(async (port) => {
    const reachable = await canReachConnector(port);

    if (!reachable) {
      throw new Error(`No connector on port ${port}`);
    }

    return getConnectorOrigin(port);
  });

  try {
    return await Promise.any(checks);
  } catch {
    return null;
  }
}
