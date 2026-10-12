import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma CLI config (migrate, studio, seed). The app runtime uses DATABASE_URL via
// the pg driver adapter (src/lib/prisma.ts); the CLI uses the direct/session URL.
// `url` is optional so `prisma generate` works before .env exists.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
