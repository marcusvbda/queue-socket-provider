export interface Env {
  DB: D1Database;
  POSTBACK_QUEUE: Queue;
  SOCKET_MANAGER: DurableObjectNamespace;
  API_TOKEN: string;
  ALLOWED_ORIGINS?: string;
}

export interface PostbackQueueMessage {
  id: string;
  postbackUrl: string;
  payload: string;
  method: string;
  headers: string | null;
}

export interface SocketConnectionInfo {
  socketId: string;
  channel: string;
  userId: string;
  connectedAt: string;
}

export interface DispatchPayload {
  channel?: string;
  userId?: string;
  event: string;
  data: Record<string, unknown>;
}
