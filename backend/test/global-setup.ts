import { execSync } from 'node:child_process';
import pg from 'pg';

/**
 * Creates servebell_test if needed and applies pending migrations. Non-destructive:
 * tests generate unique identifiers per run, so no reset is required.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://servebell:servebell_dev_password@localhost:5432/servebell_test?schema=public';
  const admin = new pg.Client({ connectionString: url.replace(/\/servebell_test/, '/postgres') });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', ['servebell_test']);
  if (exists.rowCount === 0) await admin.query('CREATE DATABASE servebell_test');
  await admin.end();
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
