# MQTT Radar 📡


[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Svelte](https://img.shields.io/badge/Svelte-5-ff3e00.svg)](https://svelte.dev)
[![Hono](https://img.shields.io/badge/Hono-4-e36002.svg)](https://hono.dev)

a minimal MQTT topic explorer.

<img width="1462" height="1111" alt="image" src="https://github.com/user-attachments/assets/1355c6cf-4b82-4a2e-a270-f91935693600" />

[t128n.github.io/mqtt-radar/](https://t128n.github.io/mqtt-radar/)
 
## Architecture

Standard web applications running in sandboxed web browsers cannot open raw TCP sockets to arbitrary MQTT brokers. 

**MQTT Radar** uses a loopback connector to solve this:
1. **`apps/connector`**: A local Node.js service (using [Hono](https://hono.dev)) that connects to the target MQTT broker (via TCP or WebSockets) and translates broker events into **Server-Sent Events (SSE)**.
2. **`apps/web`**: A [Svelte 5](https://svelte.dev) frontend dashboard that connects to the local SSE stream and displays the active topic tree.

```text
                  ┌──────────────────────────────────────────────┐
                  │                 Local Machine                │
                  │                                              │
 ┌───────────┐    │  ┌───────────────┐        ┌───────────────┐  │
 │  Remote   │◄───┼──┤apps/connector ├───────►│   apps/web    │  │
 │MQTT Broker│    │  │ (Hono Server) │  SSE   │(Browser App)  │  │
 └───────────┘    │  └───────────────┘        └───────────────┘  │
                  └──────────────────────────────────────────────┘
```

## Quick Start

Run **MQTT Radar** without cloning or installing using `npx`:

```bash
npx github:t128n/mqtt-radar
```

This starts the Hono connector and opens the web dashboard in your browser.

## CLI Options

The local connector CLI supports configuration flags to customize ports, binding interfaces, and traffic optimization.

| Flag | Alias | Type | Default | Description |
|---|---|---|---|---|
| `--port` | `-p` | `number` | `3881` | Connector HTTP server port. Auto-selects within `3881–3900` range on conflict. |
| `--host` | `-h` | `string` | `127.0.0.1` | Loopback host address to bind the connector to. |
| `--log-level`| `-l` | `string` | `info` | Logging verbosity (`trace`, `debug`, `info`, `warn`, `error`). Can be set via `LOG_LEVEL` env var. |
| `--batch-window` | - | `number` | `100` | Buffer window duration (in milliseconds) for outbound broker messages streamed over SSE. |
| `--batch-limit` | - | `number` | `100` | Maximum number of buffered broker events to chunk into a single SSE push. |
| `--backpressure-limit` | - | `number` | `500` | Maximum number of queued SSE events held in memory before older events are dropped. |

### Examples

Run on a custom port:
```bash
npx github:t128n/mqtt-radar --port 4000
```

Increase the batch limit and batching window for high-throughput brokers:
```bash
npx github:t128n/mqtt-radar --batch-window 250 --batch-limit 500 --backpressure-limit 2000
```

## Local Development

### 1. Installation

Ensure you have Node.js and `pnpm` installed:

```bash
git clone https://github.com/t128n/mqtt-radar.git
cd mqtt-radar
pnpm install
```

### 2. Development

Run the frontend and connector backend in parallel with hot reloading:

```bash
pnpm dev
```
- **Frontend**: `http://localhost:5173`
- **Backend Connector**: `http://127.0.0.1:3881`

### 3. Utility Scripts

```bash
pnpm build      # Compile and build both applications
pnpm fmt        # Run oxfmt
pnpm lint       # Run oxlint
pnpm typecheck  # Perform TypeScript validation
```

## License

Distributed under the [MIT License](LICENSE).
