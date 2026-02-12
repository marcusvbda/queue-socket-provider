import { Hono } from "hono";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// POST /api/queue/postback
app.post("/postback", async (c) => {
  let body: {
    postbackUrl: string;
    payload: Record<string, unknown>;
    method?: "GET" | "POST" | "PUT" | "PATCH";
    headers?: Record<string, string>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: "BAD_REQUEST", message: "Invalid JSON body" },
      400
    );
  }

  if (!body.postbackUrl || typeof body.postbackUrl !== "string") {
    return c.json(
      { error: "BAD_REQUEST", message: "postbackUrl is required" },
      400
    );
  }
  if (!body.payload || typeof body.payload !== "object") {
    return c.json(
      { error: "BAD_REQUEST", message: "payload is required" },
      400
    );
  }

  const method = body.method ?? "POST";
  const id = generateId();
  const createdAt = Date.now();
  const payloadStr = JSON.stringify(body.payload);
  const headersStr = body.headers ? JSON.stringify(body.headers) : null;

  try {
    await c.env.DB.prepare(
      `INSERT INTO postback_queue (id, postback_url, payload, method, headers, status, created_at, retries)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, 0)`
    )
      .bind(id, body.postbackUrl, payloadStr, method, headersStr, createdAt)
      .run();

    await c.env.POSTBACK_QUEUE.send({
      id,
      postbackUrl: body.postbackUrl,
      payload: payloadStr,
      method,
      headers: headersStr,
    });
  } catch (e) {
    console.error("Queue enqueue error:", e);
    return c.json(
      { error: "INTERNAL_ERROR", message: "Failed to enqueue postback" },
      500
    );
  }

  return c.json({
    success: true,
    message: "Postback queued successfully",
    queueId: id,
  });
});

// GET /api/queue/postback/:id
app.get("/postback/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT id, postback_url, status, created_at, retries FROM postback_queue WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!row) {
    return c.json(
      { error: "NOT_FOUND", message: "Postback not found" },
      404
    );
  }

  return c.json({
    id: row.id,
    postbackUrl: row.postback_url,
    status: row.status,
    createdAt: new Date((row.created_at as number)).toISOString(),
    retries: row.retries as number,
  });
});

// GET /api/queue/postback
app.get("/postback", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, postback_url, status, created_at, retries FROM postback_queue ORDER BY created_at DESC"
  ).all();

  const items = (results ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    postbackUrl: row.postback_url,
    status: row.status,
    createdAt: new Date((row.created_at as number)).toISOString(),
    retries: row.retries,
  }));

  return c.json(items);
});

export default app;
