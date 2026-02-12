import Fastify, { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from './config/env';
import { logger } from './utils/logger';
import { queueRoutes } from './routes/queue.routes';
import { socketRoutes } from './routes/socket.routes';
import { socketService } from './services/socket.service';

async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: env.NODE_ENV === 'development',
  });

  // Register plugins
  await fastify.register(cors, {
    origin: env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS.split(','),
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  });

  // Register routes
  await fastify.register(queueRoutes, { prefix: '/api/queue' });
  await fastify.register(socketRoutes, { prefix: '/api/socket' });

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  return fastify;
}

async function start(): Promise<void> {
  try {
    const fastify = await buildServer();

    // Get the underlying HTTP server from Fastify
    await fastify.ready();
    const httpServer = fastify.server;

    // Initialize Socket.io with Fastify's HTTP server
    const io = new SocketIOServer(httpServer, {
      path: env.SOCKET_PATH,
      cors: {
        origin: env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS.split(','),
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    socketService.initialize(io);

    // Start listening
    await fastify.listen({
      port: env.PORT,
      host: env.HOST,
    });

    logger.info('Server started', {
      port: env.PORT,
      host: env.HOST,
      environment: env.NODE_ENV,
      socketPath: env.SOCKET_PATH,
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

start();
