/**
 * Removes PLATFORM_ADMIN from an account (the opposite of make-admin).
 *   Local:      pnpm --filter @servebell/backend exec tsx scripts/revoke-admin.ts someone@example.com
 *   Production: infrastructure/scripts/revoke-admin.sh someone@example.com
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: revoke-admin <email>');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const res = await prisma.user.updateMany({ where: { email, platformRole: 'PLATFORM_ADMIN' }, data: { platformRole: 'USER' } });
console.log(res.count ? `✔ ${email} is no longer a platform administrator.` : `${email} was not a platform administrator.`);
await prisma.$disconnect();
