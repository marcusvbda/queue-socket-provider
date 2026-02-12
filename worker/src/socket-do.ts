import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";

interface ConnectionState {
  connectionId: string;
  channel: string;
  userId: string;
  connectedAt: string;
}

interface DispatchBody {
  channel?: string;
  userId?: string;
  event: string;
  data: Record<string, unknown>;
}

export class SocketManager extends DurableObject {
  private connections: Map<WebSocket, ConnectionState> = new Map();
  private channelToSockets: Map<string, Set<WebSocket>> = new Map();
  private userToSockets: Map<string, Set<WebSocket>> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal: dispatch event
    if (url.pathname === "/internal/dispatch" && request.method === "POST") {
      return this.handleDispatch(request);
    }
    // Internal: get all stats
    if (url.pathname === "/internal/stats" && request.method === "GET") {
      return this.handleStats();
    }
    // Internal: get channel stats
    const channelMatch = url.pathname.match(/^\/internal\/channel\/(.+)\/stats$/);
    if (channelMatch && request.method === "GET") {
      return this.handleChannelStats(decodeURIComponent(channelMatch[1]));
    }

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private handleWebSocket(request: Request): Response {
    const url = new URL(request.url);
    const rawChannel = url.searchParams.get("channel");
    const rawUserId = url.searchParams.get("userId");
    const channel = (rawChannel ?? "").trim() || this.generateChannel();
    const userId = (rawUserId ?? "").trim() || this.generateUserId();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const connectionId = crypto.randomUUID();
    const connectedAt = new Date().toISOString();
    const state: ConnectionState = {
      connectionId,
      channel,
      userId,
      connectedAt,
    };

    this.connections.set(server, state);

    if (!this.channelToSockets.has(channel)) {
      this.channelToSockets.set(channel, new Set());
    }
    this.channelToSockets.get(channel)!.add(server);

    if (!this.userToSockets.has(userId)) {
      this.userToSockets.set(userId, new Set());
    }
    this.userToSockets.get(userId)!.add(server);

    server.accept();

    server.addEventListener("message", (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? event.data : "";
        const msg = JSON.parse(data) as { type?: string; event?: string; data?: Record<string, unknown> };
        if (msg.type === "ping") {
          server.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
          return;
        }
        if (msg.type === "message") {
          const eventName = msg.event ?? "message";
          const payload = msg.data ?? {};
          server.send(
            JSON.stringify({
              type: "message-received",
              originalMessage: { event: eventName, data: payload, timestamp: new Date().toISOString() },
              receivedAt: new Date().toISOString(),
            })
          );
        }
      } catch {
        // ignore parse errors
      }
    });

    server.addEventListener("close", () => {
      this.removeConnection(server);
    });

    // Send connected event
    server.send(
      JSON.stringify({
        type: "connected",
        socketId: connectionId,
        channel,
        userId,
        connectedAt,
      })
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private removeConnection(ws: WebSocket): void {
    const state = this.connections.get(ws);
    if (!state) return;

    this.connections.delete(ws);

    const channelSet = this.channelToSockets.get(state.channel);
    if (channelSet) {
      channelSet.delete(ws);
      if (channelSet.size === 0) this.channelToSockets.delete(state.channel);
    }

    const userSet = this.userToSockets.get(state.userId);
    if (userSet) {
      userSet.delete(ws);
      if (userSet.size === 0) this.userToSockets.delete(state.userId);
    }

    try {
      ws.close(1000, "Connection closed");
    } catch {
      // ignore
    }
  }

  private async handleDispatch(request: Request): Promise<Response> {
    let body: DispatchBody;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const message = {
      event: body.event,
      data: body.data ?? {},
      timestamp: new Date().toISOString(),
    };

    let dispatched = 0;

    if (body.channel && body.userId) {
      const channelSet = this.channelToSockets.get(body.channel);
      const userSet = this.userToSockets.get(body.userId);
      if (channelSet && userSet) {
        for (const ws of channelSet) {
          if (userSet.has(ws) && this.connections.has(ws)) {
            try {
              ws.send(JSON.stringify(message));
              dispatched++;
            } catch {
              this.removeConnection(ws);
            }
          }
        }
      }
    } else if (body.channel) {
      const channelSet = this.channelToSockets.get(body.channel);
      if (channelSet) {
        for (const ws of channelSet) {
          if (this.connections.has(ws)) {
            try {
              ws.send(JSON.stringify(message));
              dispatched++;
            } catch {
              this.removeConnection(ws);
            }
          }
        }
      }
    } else if (body.userId) {
      const userSet = this.userToSockets.get(body.userId);
      if (userSet) {
        for (const ws of userSet) {
          if (this.connections.has(ws)) {
            try {
              ws.send(JSON.stringify(message));
              dispatched++;
            } catch {
              this.removeConnection(ws);
            }
          }
        }
      }
    }

    return Response.json({ dispatchedCount: dispatched });
  }

  private handleStats(): Response {
    const connections = Array.from(this.connections.values()).map((s) => ({
      socketId: s.connectionId,
      channel: s.channel,
      userId: s.userId,
      connectedAt: s.connectedAt,
    }));
    return Response.json({
      totalConnections: connections.length,
      connections,
    });
  }

  private handleChannelStats(channel: string): Response {
    const channelSet = this.channelToSockets.get(channel);
    const socketCount = channelSet?.size ?? 0;
    const users = new Set<string>();
    channelSet?.forEach((ws) => {
      const s = this.connections.get(ws);
      if (s) users.add(s.userId);
    });
    return Response.json({
      userCount: users.size,
      socketCount,
    });
  }

  private generateChannel(): string {
    return `channel-${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateUserId(): string {
    return `user-${Math.random().toString(36).substring(2, 11)}`;
  }
}
