import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { socketService } from '../services/socket.service';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const DispatchRequestSchema = Type.Object({
  channel: Type.Optional(Type.String()),
  userId: Type.Optional(Type.String()),
  event: Type.String({ minLength: 1 }),
  data: Type.Record(Type.String(), Type.Any()),
});

const DispatchResponseSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.String(),
  dispatchedCount: Type.Number(),
});

export async function socketRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // Dispatch event to channel/user
  fastify.post(
    '/dispatch',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Dispatch an event to socket connections via HTTP',
        body: DispatchRequestSchema,
        response: {
          200: DispatchResponseSchema,
          400: Type.Object({
            error: Type.String(),
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        channel?: string;
        userId?: string;
        event: string;
        data: Record<string, unknown>;
      };

      logger.info('Dispatch request received', {
        channel: body.channel,
        userId: body.userId,
        event: body.event,
        data: body.data,
      });

      // Validate that at least channel or userId is provided
      if (!body.channel && !body.userId) {
        logger.warn('Dispatch request missing channel and userId');
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: 'Either channel or userId must be provided',
        });
      }

      // Check current connections for debugging
      const allConnections = socketService.getAllConnections();
      logger.info('Current connections', {
        totalConnections: allConnections.length,
        connections: allConnections.map(c => ({
          socketId: c.socketId,
          channel: c.channel,
          userId: c.userId,
        })),
      });

      let dispatchedCount = 0;

      if (body.channel && body.userId) {
        // Dispatch to specific user in specific channel
        logger.info('Dispatching to user in channel', {
          channel: body.channel,
          userId: body.userId,
          event: body.event,
        });
        dispatchedCount = socketService.dispatchToUserInChannel(
          body.channel,
          body.userId,
          body.event,
          body.data
        );
      } else if (body.channel) {
        // Dispatch to all users in channel
        logger.info('Dispatching to channel', {
          channel: body.channel,
          event: body.event,
        });
        dispatchedCount = socketService.dispatchToChannel(
          body.channel,
          body.event,
          body.data
        );
      } else if (body.userId) {
        // Dispatch to user across all channels
        logger.info('Dispatching to user', {
          userId: body.userId,
          event: body.event,
        });
        dispatchedCount = socketService.dispatchToUser(
          body.userId,
          body.event,
          body.data
        );
      }

      logger.info('Dispatch completed', {
        dispatchedCount,
        channel: body.channel,
        userId: body.userId,
        event: body.event,
      });

      return reply.send({
        success: true,
        message: 'Event dispatched successfully',
        dispatchedCount,
      });
    }
  );

  // Get socket statistics
  fastify.get(
    '/sockets/stats',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get socket connection statistics',
        response: {
          200: Type.Object({
            totalConnections: Type.Number(),
            connections: Type.Array(Type.Object({
              socketId: Type.String(),
              channel: Type.String(),
              userId: Type.String(),
              connectedAt: Type.String(),
            })),
          }),
        },
      },
    },
    async (_, reply) => {
      const connections = socketService.getAllConnections();

      return reply.send({
        totalConnections: connections.length,
        connections: connections.map((conn) => ({
          socketId: conn.socketId,
          channel: conn.channel,
          userId: conn.userId,
          connectedAt: conn.connectedAt.toISOString(),
        })),
      });
    }
  );

  // Get channel statistics
  fastify.get(
    '/sockets/channel/:channel/stats',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get statistics for a specific channel',
        params: Type.Object({
          channel: Type.String(),
        }),
        response: {
          200: Type.Object({
            channel: Type.String(),
            userCount: Type.Number(),
            socketCount: Type.Number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { channel } = request.params as { channel: string };
      const stats = socketService.getChannelStats(channel);

      return reply.send({
        channel,
        ...stats,
      });
    }
  );
}
