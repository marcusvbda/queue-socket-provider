import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';

export interface SocketConnection {
  socketId: string;
  channel: string;
  userId: string;
  connectedAt: Date;
}

export interface SocketMessage {
  event: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

class SocketService {
  private io: SocketIOServer | null = null;
  private connections: Map<string, SocketConnection> = new Map();
  private channelUsers: Map<string, Set<string>> = new Map(); // channel -> Set of socketIds
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  /**
   * Initialize socket.io server
   */
  initialize(io: SocketIOServer): void {
    this.io = io;
    this.setupMiddleware();
    this.setupEventHandlers();
    logger.info('Socket service initialized');
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware(): void {
    if (!this.io) return;

    this.io.use(async (socket, next) => {
      try {
        // Extract token from handshake
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token || token !== process.env.API_TOKEN) {
          return next(new Error('Authentication failed'));
        }

        socket.data.authenticated = true;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup socket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: Socket): void {
    // Normalize to string so dispatch lookup always matches (query can be string or string[])
    const rawChannel = socket.handshake.query.channel;
    const rawUserId = socket.handshake.query.userId;
    const channel = (Array.isArray(rawChannel) ? rawChannel[0] : rawChannel)?.trim?.() || this.generateChannel();
    const userId = (Array.isArray(rawUserId) ? rawUserId[0] : rawUserId)?.trim?.() || this.generateUserId();

    const connection: SocketConnection = {
      socketId: socket.id,
      channel,
      userId,
      connectedAt: new Date(),
    };

    this.connections.set(socket.id, connection);

    // Add to channel mapping
    if (!this.channelUsers.has(channel)) {
      this.channelUsers.set(channel, new Set());
    }
    this.channelUsers.get(channel)!.add(socket.id);

    // Add to user mapping
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);

    // Join socket.io room for the channel
    socket.join(channel);

    logger.info('Socket connected', {
      socketId: socket.id,
      channel,
      userId,
    });

    // Send connection confirmation
    socket.emit('connected', {
      socketId: socket.id,
      channel,
      userId,
      connectedAt: connection.connectedAt,
    });

    // Handle custom events
    socket.on('message', (data: Record<string, unknown>) => {
      this.handleMessage(socket, data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Handle ping/pong for keepalive
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });
  }

  /**
   * Handle incoming messages from socket
   */
  private handleMessage(socket: Socket, data: Record<string, unknown>): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    const message: SocketMessage = {
      event: (data.event as string) || 'message',
      data: data.data as Record<string, unknown> || data,
      timestamp: new Date(),
    };

    logger.debug('Message received', {
      socketId: socket.id,
      channel: connection.channel,
      userId: connection.userId,
      event: message.event,
    });

    // Echo back to sender (or implement custom logic)
    socket.emit('message-received', {
      originalMessage: message,
      receivedAt: new Date(),
    });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: Socket): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    // Remove from channel mapping
    const channelSockets = this.channelUsers.get(connection.channel);
    if (channelSockets) {
      channelSockets.delete(socket.id);
      if (channelSockets.size === 0) {
        this.channelUsers.delete(connection.channel);
      }
    }

    // Remove from user mapping
    const userSockets = this.userSockets.get(connection.userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        this.userSockets.delete(connection.userId);
      }
    }

    this.connections.delete(socket.id);

    logger.info('Socket disconnected', {
      socketId: socket.id,
      channel: connection.channel,
      userId: connection.userId,
    });
  }

  /**
   * Dispatch event to a specific channel
   */
  dispatchToChannel(channel: string, event: string, data: Record<string, unknown>): number {
    if (!this.io) return 0;

    const message: SocketMessage = {
      event,
      data,
      timestamp: new Date(),
    };

    const channelSockets = this.channelUsers.get(channel);
    if (!channelSockets || channelSockets.size === 0) {
      logger.warn('No sockets found for channel', { channel });
      return 0;
    }

    this.io.to(channel).emit(event, message);
    
    logger.info('Event dispatched to channel', {
      channel,
      event,
      socketCount: channelSockets.size,
    });

    return channelSockets.size;
  }

  /**
   * Dispatch event to a specific user
   */
  dispatchToUser(userId: string, event: string, data: Record<string, unknown>): number {
    if (!this.io) return 0;

    const message: SocketMessage = {
      event,
      data,
      timestamp: new Date(),
    };

    const userSockets = this.userSockets.get(userId);
    if (!userSockets || userSockets.size === 0) {
      logger.warn('No sockets found for user', { userId });
      return 0;
    }

    // Send to all sockets of this user
    let dispatched = 0;
    userSockets.forEach((socketId) => {
      const socket = this.io!.sockets.sockets.get(socketId);
      if (socket && socket.connected) {
        socket.emit(event, message);
        dispatched++;
      } else {
        logger.debug('Socket not found or not connected for user dispatch', {
          socketId,
          userId,
          socketExists: !!socket,
          socketConnected: socket?.connected,
        });
      }
    });

    logger.info('Event dispatched to user', {
      userId,
      event,
      socketCount: dispatched,
      totalSockets: userSockets.size,
    });

    return dispatched;
  }

  /**
   * Dispatch event to a specific user in a specific channel
   */
  dispatchToUserInChannel(
    channel: string,
    userId: string,
    event: string,
    data: Record<string, unknown>
  ): number {
    if (!this.io) return 0;

    const message: SocketMessage = {
      event,
      data,
      timestamp: new Date(),
    };

    const channelSockets = this.channelUsers.get(channel);
    if (!channelSockets) {
      logger.warn('Channel not found', { channel });
      return 0;
    }

    // Find sockets that belong to this user in this channel
    const userSockets = this.userSockets.get(userId);
    if (!userSockets) {
      logger.warn('User not found', { userId });
      return 0;
    }

    let dispatched = 0;
    userSockets.forEach((socketId) => {
      if (channelSockets.has(socketId)) {
        // Get the socket directly to verify it exists
        const socket = this.io!.sockets.sockets.get(socketId);
        if (socket && socket.connected) {
          logger.info('Dispatching event to socket', {
            socketId,
            channel,
            userId,
            event,
          });
          socket.emit(event, message);
          dispatched++;
        } else {
          logger.warn('Socket not found or not connected', {
            socketId,
            channel,
            userId,
            socketExists: !!socket,
            socketConnected: socket?.connected,
          });
        }
      } else {
        logger.debug('Socket not in channel mapping', {
          socketId,
          channel,
          userId,
          channelHasSocket: channelSockets.has(socketId),
        });
      }
    });

    logger.info('Event dispatched to user in channel', {
      channel,
      userId,
      event,
      socketCount: dispatched,
      totalUserSockets: userSockets.size,
      totalChannelSockets: channelSockets.size,
    });

    return dispatched;
  }

  /**
   * Get connection info
   */
  getConnection(socketId: string): SocketConnection | undefined {
    return this.connections.get(socketId);
  }

  /**
   * Get all connections (for monitoring)
   */
  getAllConnections(): SocketConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get channel statistics
   */
  getChannelStats(channel: string): { userCount: number; socketCount: number } {
    const sockets = this.channelUsers.get(channel);
    const socketCount = sockets?.size || 0;
    
    // Count unique users in channel
    const users = new Set<string>();
    sockets?.forEach((socketId) => {
      const conn = this.connections.get(socketId);
      if (conn) {
        users.add(conn.userId);
      }
    });

    return {
      userCount: users.size,
      socketCount,
    };
  }

  /**
   * Generate random channel ID
   */
  private generateChannel(): string {
    return `channel-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate random user ID
   */
  private generateUserId(): string {
    return `user-${Math.random().toString(36).substring(2, 11)}`;
  }
}

export const socketService = new SocketService();
