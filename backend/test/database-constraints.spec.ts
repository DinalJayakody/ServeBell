import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

describe('Database-level guarantees', () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  afterAll(() => prisma.$disconnect());

  async function fixture() {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const restaurant = await prisma.restaurant.create({ data: { slug: `db-${tag}`, name: 'DB Test', addressLine: 'x', city: 'Colombo' } });
    const table = await prisma.restaurantTable.create({ data: { restaurantId: restaurant.id, label: 'T1', capacity: 4 } });
    const customer = await prisma.user.create({ data: { authUserId: crypto.randomUUID(), email: `db-${tag}@test.dev`, fullName: 'C' } });
    return { restaurant, table, customer };
  }

  it('prevents overlapping reservations for the same table under concurrency', async () => {
    const { restaurant, table, customer } = await fixture();
    const base = { restaurantId: restaurant.id, tableId: table.id, customerId: customer.id, partySize: 2 };
    const results = await Promise.allSettled([
      prisma.reservation.create({ data: { ...base, startsAt: new Date('2030-01-01T18:00:00Z'), endsAt: new Date('2030-01-01T20:00:00Z') } }),
      prisma.reservation.create({ data: { ...base, startsAt: new Date('2030-01-01T19:00:00Z'), endsAt: new Date('2030-01-01T21:00:00Z') } }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('allows back-to-back and cancelled-slot reservations', async () => {
    const { restaurant, table, customer } = await fixture();
    const base = { restaurantId: restaurant.id, tableId: table.id, customerId: customer.id, partySize: 2 };
    const first = await prisma.reservation.create({ data: { ...base, startsAt: new Date('2030-02-01T18:00:00Z'), endsAt: new Date('2030-02-01T20:00:00Z') } });
    await prisma.reservation.create({ data: { ...base, startsAt: new Date('2030-02-01T20:00:00Z'), endsAt: new Date('2030-02-01T22:00:00Z') } });
    await prisma.reservation.update({ where: { id: first.id }, data: { status: 'CANCELLED' } });
    await expect(
      prisma.reservation.create({ data: { ...base, startsAt: new Date('2030-02-01T18:30:00Z'), endsAt: new Date('2030-02-01T19:30:00Z') } }),
    ).resolves.toBeDefined();
  });

  it('allows only one active QR code per table', async () => {
    const { restaurant, table } = await fixture();
    await prisma.tableQrCode.create({ data: { restaurantId: restaurant.id, tableId: table.id, version: 1, token: `a-${table.id}` } });
    await expect(prisma.tableQrCode.create({ data: { restaurantId: restaurant.id, tableId: table.id, version: 2, token: `b-${table.id}` } })).rejects.toThrow();
  });

  it('allows only one active visit per customer', async () => {
    const { restaurant, table, customer } = await fixture();
    const visit = { restaurantId: restaurant.id, tableId: table.id, customerId: customer.id, expiresAt: new Date(Date.now() + 3_600_000) };
    await prisma.restaurantVisit.create({ data: visit });
    await expect(prisma.restaurantVisit.create({ data: visit })).rejects.toThrow();
  });

  it('enforces value checks', async () => {
    const { restaurant } = await fixture();
    await expect(prisma.restaurantTable.create({ data: { restaurantId: restaurant.id, label: 'Big', capacity: 0 } })).rejects.toThrow();
    await expect(prisma.restaurantTable.create({ data: { restaurantId: restaurant.id, label: 't1', capacity: 2 } })).rejects.toThrow(); // case-insensitive label clash
  });
});
