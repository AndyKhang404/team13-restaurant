import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Supabase pooler URL)'),

  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z
    .string()
    .min(1, 'SUPABASE_SECRET_KEY is required')
    .default(() => process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
  STORAGE_BUCKET: z.string().min(1).default('images'),

  CAPTCHA_SITE_KEY: z.string().min(1, 'CAPTCHA_SITE_KEY is required'),
  CAPTCHA_SECRET_KEY: z.string().min(1, 'CAPTCHA_SECRET_KEY is required'),

  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),

  // Local auth policy (published in README so it can be verified).
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(60),
  OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().positive().default(5),

  // SMTP is optional at boot so the public site can run without mail, but
  // registration/forgot return a clear error until it is configured.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().min(1).default('Team13 Restaurant <no-reply@team13.local>'),
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
