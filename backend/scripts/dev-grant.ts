/**
 * DEVELOPMENT ONLY: give an existing account a role at a seeded restaurant, so real
 * Firebase accounts can test owner/admin/waiter flows locally.
 *   pnpm dev:grant you@example.com OWNER            (default restaurant: ocean-breeze-colombo)
 *   pnpm dev:grant waiter@example.com WAITER some-restaurant-slug
 * Refuses to run when NODE_ENV=production. In production use invitations / owner approval.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type RestaurantRole } from '../src/generated/prisma/client.js';

if (process.env.NODE_ENV === 'production') {
  console.error('dev-grant is disabled in production. Use invitations and owner approval.');
  process.exit(1);
}
const [emailArg, roleArg = 'OWNER', slug = 'ocean-breeze-colombo'] = process.argv.slice(2);
const role = roleArg.toUpperCase() as RestaurantRole;
if (!emailArg || !['OWNER', 'ADMIN', 'WAITER'].includes(role)) {
  console.error('Usage: pnpm dev:grant <email> [OWNER|ADMIN|WAITER] [restaurant-slug]');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const email = emailArg.toLowerCase();
const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No profile for ${email}. Sign up / sign in once in the app first.`);
  process.exit(1);
}
const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
if (!restaurant) {
  console.error(`No restaurant "${slug}". Run pnpm db:seed.`);
  process.exit(1);
}
const count = await prisma.restaurantMember.count({ where: { restaurantId: restaurant.id } });
await prisma.restaurantMember.upsert({
  where: { restaurantId_userId: { restaurantId: restaurant.id, userId: user.id } },
  update: { role, status: 'ACTIVE' },
  create: { restaurantId: restaurant.id, userId: user.id, role, employeeCode: `EMP-${String(count + 1).padStart(4, '0')}` },
});
console.log(`✔ ${email} is now ${role} at ${restaurant.name}. Pull to refresh or reopen the Restaurant app.`);
await prisma.$disconnect();
