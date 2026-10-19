import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().optional().default(''),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Supabase pooler URL)'),

  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, 'SUPABASE_PUBLISHABLE_KEY is required')
    .default(() => process.env.SUPABASE_ANON_KEY ?? ''),
  SUPABASE_SECRET_KEY: z
    .string()
    .min(1, 'SUPABASE_SECRET_KEY is required')
    .default(() => process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
  STORAGE_BUCKET: z.string().min(1).default('images'),

  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    console.error(`\n❌ Invalid environment configuration:\n${lines.join('\n')}\n`);
    console.error('Copy .env.example to .env and fill in the values.\n');
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === 'production';
