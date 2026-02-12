import type { Context, Next } from "hono";
import type { Env } from "./types";

export function authMiddleware() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json(
        { error: "UNAUTHORIZED", message: "Authorization header is required" },
        401
      );
    }
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;
    if (token !== c.env.API_TOKEN) {
      return c.json(
        { error: "FORBIDDEN", message: "Invalid API token" },
        403
      );
    }
    await next();
  };
}
