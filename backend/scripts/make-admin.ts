/**
 * Grants PLATFORM_ADMIN (approves restaurant owners) to an existing account.
 * The person must have signed in to either app once (so their profile exists).
 *   Local:      pnpm --filter @servebell/backend exec tsx scripts/make-admin.ts you@example.com
 *   Production: infrastructure/scripts/make-admin.sh you@example.com   (runs the same update via psql)
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: make-admin <email>');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No ServeBell profile for ${email}. Sign in to one of the apps once with that account, then retry.`);
  process.exit(1);
}
await prisma.user.update({ where: { id: user.id }, data: { platformRole: 'PLATFORM_ADMIN' } });
await prisma.auditLog.create({ data: { action: 'platform.admin_granted', entityType: 'User', entityId: user.id, meta: { via: 'cli' } } });
console.log(`✔ ${email} is now a platform administrator.`);
await prisma.$disconnect();
