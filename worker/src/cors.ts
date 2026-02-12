import type { Context, Next } from "hono";
import type { Env } from "./types";

export function corsMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const origin = c.env.ALLOWED_ORIGINS ?? "*";
    const reqOrigin = c.req.header("Origin");
    const allowOrigin = origin === "*" ? (reqOrigin ?? "*") : origin;

    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowOrigin,
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    await next();

    const res = c.res;
    const newHeaders = new Headers(res.headers);
    newHeaders.set("Access-Control-Allow-Origin", allowOrigin);
    newHeaders.set("Access-Control-Allow-Credentials", "true");
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  };
}
