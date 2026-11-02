import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, signUp } from './harness.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import { isOpenNow } from '../src/restaurants/opening-hours.js';

describe('Restaurant discovery (public)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tag = `disc${Date.now()}`;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const mk = (name: string, city: string, lat: number, lng: number, status: 'ACTIVE' | 'DRAFT' = 'ACTIVE') =>
      prisma.restaurant.create({ data: { slug: `${tag}-${name.toLowerCase().replace(/\s/g, '-')}`, name: `${tag} ${name}`, city, addressLine: 'x', latitude: lat, longitude: lng, status } });
    await mk('Colombo Grill', 'Colombo', 6.9271, 79.8612);
    await mk('Kandy House', 'Kandy', 7.2906, 80.6337);
    await mk('Galle Cafe', 'Galle', 6.0535, 80.221);
    await mk('Hidden Draft', 'Colombo', 6.9, 79.86, 'DRAFT');
  });
  afterAll(() => app.close());

  it('searches by name without authentication and hides DRAFT restaurants', async () => {
    const res = await api(app).get(`/restaurants?q=${tag}&limit=50`);
    expect(res.status).toBe(200);
    const names = res.body.items.map((r: { name: string }) => r.name);
    expect(names).toHaveLength(3);
    expect(names.join()).not.toContain('Hidden Draft');
  });

  it('orders by distance from the given location', async () => {
    const res = await api(app).get(`/restaurants?q=${tag}&lat=7.29&lng=80.63`);
    expect(res.body.items[0].name).toContain('Kandy House');
    expect(res.body.items[0].distanceKm).toBeLessThan(2);
    const km = res.body.items.map((r: { distanceKm: number }) => r.distanceKm);
    expect([...km].sort((a, b) => a - b)).toEqual(km);
  });

  it('paginates with a cursor', async () => {
    const first = await api(app).get(`/restaurants?q=${tag}&limit=2`);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toBe('2');
    const second = await api(app).get(`/restaurants?q=${tag}&limit=2&cursor=2`);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('searches by location text', async () => {
    const res = await api(app).get(`/restaurants?q=galle`);
    expect(res.body.items.some((r: { name: string }) => r.name === `${tag} Galle Cafe`)).toBe(true);
  });

  it('returns details by slug, 404 for drafts, and validates query input', async () => {
    expect((await api(app).get(`/restaurants/${tag}-colombo-grill`)).body.isFavourite).toBe(false);
    expect((await api(app).get(`/restaurants/${tag}-hidden-draft`)).status).toBe(404);
    expect((await api(app).get('/restaurants?lat=500')).status).toBe(400);
  });

  it('computes open-now including overnight windows', () => {
    // 2030-01-01 is a Tuesday. 23:30 Colombo = 18:00Z, 01:00 Wed = 19:30Z.
    const hours = [{ dayOfWeek: 2, opensMinute: 18 * 60, closesMinute: 26 * 60 }];
    expect(isOpenNow(hours, 'Asia/Colombo', new Date('2030-01-01T18:00:00Z'))).toBe(true);
    expect(isOpenNow(hours, 'Asia/Colombo', new Date('2030-01-01T19:30:00Z'))).toBe(true);
    expect(isOpenNow(hours, 'Asia/Colombo', new Date('2030-01-01T21:00:00Z'))).toBe(false);
  });
});

describe('Push device registration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  afterAll(() => app.close());

  it('registers, moves a token to the latest user and only lets owners unregister', async () => {
    const token = `ExponentPushToken[${Date.now()}]`;
    const a = await signUp(app, 'dev-a');
    const b = await signUp(app, 'dev-b');
    const body = { expoPushToken: token, platform: 'ANDROID', app: 'CUSTOMER' };
    expect((await api(app, a.token).post('/notifications/devices', body)).status).toBe(204);
    expect((await api(app, b.token).post('/notifications/devices', body)).status).toBe(204);
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { expoPushToken: token } })).userId).toBe(b.id);

    await api(app, a.token).delete(`/notifications/devices/${encodeURIComponent(token)}`);
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { expoPushToken: token } })).disabledAt).toBeNull();
    await api(app, b.token).delete(`/notifications/devices/${encodeURIComponent(token)}`);
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { expoPushToken: token } })).disabledAt).not.toBeNull();
  });

  it('rejects malformed tokens', async () => {
    const a = await signUp(app, 'dev-c');
    expect((await api(app, a.token).post('/notifications/devices', { expoPushToken: 'nope', platform: 'IOS', app: 'CUSTOMER' })).status).toBe(400);
  });
});

describe('Table QR resolution (public)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  afterAll(() => app.close());

  it('resolves active codes and rejects revoked, malformed and unknown ones identically', async () => {
    const tag = `qr${Date.now()}`;
    const r = await prisma.restaurant.create({ data: { slug: tag, name: 'QR Place', city: 'Colombo', addressLine: 'x', status: 'ACTIVE' } });
    const table = await prisma.restaurantTable.create({ data: { restaurantId: r.id, label: 'T9', capacity: 4, zone: 'Patio' } });
    const active = await prisma.tableQrCode.create({ data: { restaurantId: r.id, tableId: table.id, version: 2, token: `${tag}activetoken01` } });
    await prisma.tableQrCode.create({ data: { restaurantId: r.id, tableId: table.id, version: 1, token: `${tag}revokedtoken1`, status: 'REVOKED' } });

    const ok = await api(app).get(`/qr/${active.token}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ restaurant: { slug: tag, name: 'QR Place' }, table: { label: 'T9', capacity: 4, zone: 'Patio' } });

    for (const bad of [`${tag}revokedtoken1`, 'unknownunknownunknown', 'bad!token']) {
      const res = await api(app).get(`/qr/${encodeURIComponent(bad)}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('QR_INVALID');
    }
  });
});
