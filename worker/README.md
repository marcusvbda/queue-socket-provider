# Queue Socket Provider – Cloudflare Worker

This directory contains the Cloudflare Workers implementation of the queue and socket APIs.

## Setup

1. **Install dependencies**
   ```bash
   cd worker && npm install
   ```

2. **Create D1 database**
   ```bash
   npx wrangler d1 create queue-socket-db
   ```
   Copy the `database_id` from the output and set it in `wrangler.toml` under `[[d1_databases]]` → `database_id`.

3. **Apply D1 migrations**
   ```bash
   npx wrangler d1 migrations apply queue-socket-db
   ```
   For local dev:
   ```bash
   npx wrangler d1 migrations apply queue-socket-db --local
   ```

4. **Create the Queue**
   ```bash
   npx wrangler queues create postback-queue
   ```

5. **Set API token secret**
   ```bash
   npx wrangler secret put API_TOKEN
   ```
   Enter your API token when prompted.

## Development

```bash
npm run dev
```

The worker will be available at `http://localhost:8787` (or the port shown). For local dev, D1 and Queues run locally; the Durable Object runs in the same process.

## Deploy

```bash
npm run deploy
```

After deploy, use your Worker URL (e.g. `https://queue-socket-provider.<your-subdomain>.workers.dev`) as the server URL in the socket client example. Set "Use WebSocket (Worker)" and connect; dispatch via `POST /api/socket/dispatch` and queue postbacks via `POST /api/queue/postback` with the same request shapes as the Node app.

## Endpoints

- `GET /health` – Health check
- `GET /ws` – WebSocket upgrade (query: `token`, `channel`, `userId`)
- `POST /api/queue/postback` – Enqueue postback (auth required)
- `GET /api/queue/postback` – List postbacks (auth required)
- `GET /api/queue/postback/:id` – Get postback status (auth required)
- `POST /api/socket/dispatch` – Dispatch event to channel/user (auth required)
- `GET /api/socket/sockets/stats` – Connection stats (auth required)
- `GET /api/socket/sockets/channel/:channel/stats` – Channel stats (auth required)
