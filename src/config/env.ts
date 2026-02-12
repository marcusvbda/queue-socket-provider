import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  API_TOKEN: z.string().min(1, 'API_TOKEN is required'),
  ALLOWED_ORIGINS: z.string().default('*'),
  SOCKET_PATH: z.string().default('/socket.io'),
});

export const env = envSchema.parse(process.env);
