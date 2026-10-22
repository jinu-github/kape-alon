import { z } from 'zod';

const envSchema = z.object({
  ALLOW_DEMO_RESET: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  CUSTOMER_BASE_URL: z
    .url()
    .refine(
      (value) =>
        ['http:', 'https:'].includes(new URL(value).protocol) &&
        new URL(value).origin === value,
      'Use an HTTP(S) origin without trailing slash',
    )
    .optional(),
  JWT_SECRET: z.string().min(32),
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DEMO_PASSWORD: z.string().min(8).max(72).optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().startsWith('postgres'),
  WEB_ORIGIN: z
    .url()
    .refine(
      (value) => new URL(value).origin === value,
      'Use an exact origin without a trailing slash',
    )
    .default('http://localhost:5173'),
});
export const env = envSchema.parse(process.env);
