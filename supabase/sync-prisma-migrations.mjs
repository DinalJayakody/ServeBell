#!/usr/bin/env node
/**
 * Prisma is the source of truth for application tables. This copies every Prisma migration into
 * supabase/migrations (same timestamp + name), so `supabase db reset` / `supabase db push` apply the
 * exact SQL the backend tests run against. Supabase-only SQL (auth link, RLS, realtime, jobs) lives
 * in supabase/migrations directly. Run after creating a Prisma migration:  node supabase/sync-prisma-migrations.mjs
 */
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const from = join(root, 'backend/prisma/migrations');
const to = join(root, 'supabase/migrations');
let copied = 0;
for (const name of readdirSync(from).filter((n) => /^\d{14}_/.test(n)).sort()) {
  const src = join(from, name, 'migration.sql');
  const dst = join(to, `${name}.sql`);
  if (existsSync(dst) && readFileSync(dst, 'utf8') === readFileSync(src, 'utf8')) continue;
  copyFileSync(src, dst);
  copied++;
  console.log(`synced ${name}`);
}
console.log(copied ? `${copied} migration(s) synced` : 'already in sync');
