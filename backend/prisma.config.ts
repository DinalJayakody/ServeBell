import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // `prisma generate` (CI, Docker builds) needs no database; migrate/seed commands
  // fail clearly with a connection error if DATABASE_URL is missing.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
