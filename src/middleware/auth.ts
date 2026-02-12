import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    return reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Authorization header is required',
    });
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  if (token !== env.API_TOKEN) {
    return reply.code(403).send({
      error: 'FORBIDDEN',
      message: 'Invalid API token',
    });
  }
}
