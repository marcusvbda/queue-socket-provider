import { Hono } from "hono";
import { authMiddleware } from "./auth";
import { corsMiddleware } from "./cors";
import queueRoutes from "./routes/queue";
import socketRoutes from "./routes/socket";
import type { Env } from "./types";
import { SocketManager } from "./socket-do";

const app = new Hono<{ Bindings: Env }>();

app.use("*", corsMiddleware());

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() })
);

app.use("/api/queue/*", authMiddleware());
app.use("/api/socket/*", authMiddleware());

app.route("/api/queue", queueRoutes);
app.route("/api/socket", socketRoutes);

// WebSocket upgrade: validate and forward to Durable Object
async function handleWebSocketUpgrade(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token =
    url.searchParams.get("token") ??
    request.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token || token !== env.API_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Authentication failed", message: "Invalid or missing API token" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "X-WebSocket-Reject-Reason": "Authentication failed",
        },
      }
    );
  }

  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }

  const id = env.SOCKET_MANAGER.idFromName("default");
  const stub = env.SOCKET_MANAGER.get(id);
  return stub.fetch(request);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws" && request.method === "GET") {
      return handleWebSocketUpgrade(request, env);
    }

    return app.fetch(request, env, ctx);
  },

  async queue(
    batch: MessageBatch,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        const body = message.body as {
          id: string;
          postbackUrl: string;
          payload: string;
          method: string;
          headers: string | null;
        };

        const row = await env.DB.prepare(
          "SELECT id, postback_url, payload, method, headers, status, retries FROM postback_queue WHERE id = ?"
        )
          .bind(body.id)
          .first();

        if (!row || (row.status as string) !== "pending") {
          message.ack();
          continue;
        }

        await env.DB.prepare(
          "UPDATE postback_queue SET status = 'processing' WHERE id = ?"
        )
          .bind(body.id)
          .run();

        const method = (row.method as string) || "POST";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "QueueSocketProvider/1.0",
        };
        if (row.headers) {
          try {
            Object.assign(headers, JSON.parse(row.headers as string));
          } catch {
            // ignore
          }
        }

        const fetchOpts: RequestInit = {
          method,
          headers,
          signal: AbortSignal.timeout(30000),
        };
        if (method !== "GET" && row.payload) {
          fetchOpts.body = row.payload as string;
        }

        const res = await fetch(row.postback_url as string, fetchOpts);

        if (res.ok) {
          await env.DB.prepare(
            "UPDATE postback_queue SET status = 'completed' WHERE id = ?"
          )
            .bind(body.id)
            .run();
          message.ack();
        } else {
          const retries = ((row.retries as number) ?? 0) + 1;
          if (retries >= 3) {
            await env.DB.prepare(
              "UPDATE postback_queue SET status = 'failed', retries = ? WHERE id = ?"
            )
              .bind(retries, body.id)
              .run();
            message.ack();
          } else {
            await env.DB.prepare(
              "UPDATE postback_queue SET status = 'pending', retries = ? WHERE id = ?"
            )
              .bind(retries, body.id)
              .run();
            message.retry();
          }
        }
      } catch (err) {
        console.error("Queue consumer error:", err);
        message.retry();
      }
    }
  },
};

export { SocketManager };
