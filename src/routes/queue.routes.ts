import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { queueService } from '../services/queue.service';
import { authenticate } from '../middleware/auth';

const PostbackRequestSchema = Type.Object({
  postbackUrl: Type.String({ format: 'uri' }),
  payload: Type.Record(Type.String(), Type.Any()),
  method: Type.Optional(Type.Union([
    Type.Literal('GET'),
    Type.Literal('POST'),
    Type.Literal('PUT'),
    Type.Literal('PATCH'),
  ])),
  headers: Type.Optional(Type.Record(Type.String(), Type.String())),
});

const PostbackResponseSchema = Type.Object({
  success: Type.Boolean(),
  message: Type.String(),
  queueId: Type.String(),
});

const QueueStatusSchema = Type.Object({
  id: Type.String(),
  postbackUrl: Type.String(),
  status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('processing'),
    Type.Literal('completed'),
    Type.Literal('failed'),
  ]),
  createdAt: Type.String(),
  retries: Type.Number(),
});

export async function queueRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // Register postback request
  fastify.post(
    '/postback',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Register a postback request to be executed asynchronously',
        body: PostbackRequestSchema,
        response: {
          200: PostbackResponseSchema,
          401: Type.Object({
            error: Type.String(),
            message: Type.String(),
          }),
          403: Type.Object({
            error: Type.String(),
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const body = request.body as Static<typeof PostbackRequestSchema>;
      
      const queueId = await queueService.enqueue({
        postbackUrl: body.postbackUrl,
        payload: body.payload,
        method: body.method,
        headers: body.headers,
      });

      // Return immediate response
      return reply.code(200).send({
        success: true,
        message: 'Postback queued successfully',
        queueId,
      });
    }
  );

  // Get postback status
  fastify.get(
    '/postback/:id',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get the status of a queued postback',
        params: Type.Object({
          id: Type.String(),
        }),
        response: {
          200: QueueStatusSchema,
          404: Type.Object({
            error: Type.String(),
            message: Type.String(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const status = queueService.getStatus(id);

      if (!status) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Postback not found',
        });
      }

      return reply.send({
        id: status.id,
        postbackUrl: status.postbackUrl,
        status: status.status,
        createdAt: status.createdAt.toISOString(),
        retries: status.retries,
      });
    }
  );

  // Get all queue items (for monitoring)
  fastify.get(
    '/postback',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get all queued postbacks (for monitoring)',
        response: {
          200: Type.Array(QueueStatusSchema),
        },
      },
    },
    async (_, reply) => {
      const items = queueService.getAllItems();
      
      return reply.send(
        items.map((item) => ({
          id: item.id,
          postbackUrl: item.postbackUrl,
          status: item.status,
          createdAt: item.createdAt.toISOString(),
          retries: item.retries,
        }))
      );
    }
  );
}
