## Tasks

### 🐛 Critical Bugs & Security
- [x] **Fix SSE Memory Leak**: Ensure all `brokerService` event listeners are cleaned up in the Hono SSE route when the broker disconnects (currently leaking in `apps/connector/src/routes/events.ts`).
- [x] **Secure Local Connector**: Restrict CORS wildcard policy.  Either from localhost:*, 127.0.0.1:* or t128n.github.io/mqtt-radar/. 

### ⚡ Performance & Reliability
- [x] **Backend SSE Throttling/Batching**: Buffer and batch outbound events in the connector Hono route to mitigate backpressure on high-frequency MQTT topics.
- [ ] **Robust Reconnection**: Add an exponential-backoff retry loop to the Svelte EventSource connection error handler to prevent aggressive pairing wipes on transient drops.
- [ ] **Friendly Broker Connection Feedback**: Map raw TCP/MQTT connection errors (like `ECONNREFUSED`, `ENOTFOUND`, certificate mismatches) to descriptive, user-friendly strings on the backend, and display them in the frontend popover.

### 🌐 Web Site QoL & SEO
- [ ] **Favicon Redesign**: Replace default Svelte favicon with a custom-designed radar/MQTT themed favicon in SVG/ICO formats, including apple-touch-icon.
- [ ] **Search Engine Optimization (SEO)**:
  - [ ] Set title to a descriptive name (e.g. `MQTT Radar | Real-time MQTT Topic Explorer & Client`).
  - [ ] Add meta description, keywords, and robot crawler tags in `apps/web/index.html`.
  - [ ] Add Open Graph (OG) tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`) for rich embeds on Discord/Slack/GitHub.
  - [ ] Add Twitter Card meta tags.
- [ ] **Performance & CWV (Core Web Vitals)**: Optimize custom fonts preload, CSS bundle delivery, and layout shift (CLS) for dynamic panes.

### 🏗️ Architecture & 0.1.0 Release Setup
- [ ] **Support `npx` from GitHub**: Modify root `.gitignore` to allow tracking of pre-compiled binaries inside `apps/connector/dist/` so that executing `npx github:t128n/mqtt-radar` works out-of-the-box.
- [ ] **API Validation with Valibot**: Add `valibot` schema validation to Hono backend endpoints (such as `POST /api/broker`) to check incoming parameters safely.
- [ ] **Serve Web from Connector**: Allow the local connector to optionally serve the compiled Svelte frontend directly, bypassing CORS and browser Mixed-Content blocks when pairing with `https://mqtt.t128n.dev`.
- [ ] **CLI Configuration**: Use a CLI parsing library (bomb.sh args) to support flags like `--port`, `--host`, `--log-level`, `--no-open`, and e.g. for backpressure, batching, ...
- [ ] **Finalize Repo Structure**: 
  - Add root-level `README.md` explaining monorepo architecture and CLI usage.
  - Replace boilerplate web `README.md` with genuine project documentation.
  - Add standard `LICENSE` file.
- [ ] **Setup CI/CD Pipeline**: Add GitHub Actions workflow for linting, type-checking, and automatically publishing CLI binary builds.
