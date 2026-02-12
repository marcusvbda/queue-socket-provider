import { Hono } from "hono";
import type { Env } from "../types";
import type { DispatchPayload } from "../types";

const app = new Hono<{ Bindings: Env }>();

// POST /api/socket/dispatch
app.post("/dispatch", async (c) => {
  let body: DispatchPayload;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: "BAD_REQUEST", message: "Invalid JSON body" },
      400
    );
  }

  if (!body.channel && !body.userId) {
    return c.json(
      { error: "BAD_REQUEST", message: "Either channel or userId must be provided" },
      400
    );
  }
  if (!body.event || typeof body.event !== "string") {
    return c.json(
      { error: "BAD_REQUEST", message: "event is required" },
      400
    );
  }

  const id = c.env.SOCKET_MANAGER.idFromName("default");
  const stub = c.env.SOCKET_MANAGER.get(id);

  const payload = {
    channel: body.channel,
    userId: body.userId,
    event: body.event,
    data: body.data ?? {},
  };

  const res = await stub.fetch("https://internal/dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return c.json(
      { error: "DISPATCH_FAILED", message: "Dispatch request failed" },
      500
    );
  }

  const { dispatchedCount } = (await res.json()) as { dispatchedCount: number };
  return c.json({
    success: true,
    message: "Event dispatched successfully",
    dispatchedCount,
  });
});

// GET /api/socket/sockets/stats
app.get("/sockets/stats", async (c) => {
  const id = c.env.SOCKET_MANAGER.idFromName("default");
  const stub = c.env.SOCKET_MANAGER.get(id);
  const res = await stub.fetch("https://internal/stats");
  if (!res.ok) {
    return c.json(
      { error: "INTERNAL_ERROR", message: "Failed to get stats" },
      500
    );
  }
  const data = await res.json();
  return c.json(data);
});

// GET /api/socket/sockets/channel/:channel/stats
app.get("/sockets/channel/:channel/stats", async (c) => {
  const channel = c.req.param("channel");
  const id = c.env.SOCKET_MANAGER.idFromName("default");
  const stub = c.env.SOCKET_MANAGER.get(id);
  const res = await stub.fetch(`https://internal/channel/${encodeURIComponent(channel)}/stats`);
  if (!res.ok) {
    return c.json(
      { error: "INTERNAL_ERROR", message: "Failed to get channel stats" },
      500
    );
  }
  const data = await res.json();
  return c.json({ channel, ...data });
});

export default app;
