import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser } from './harness.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';

describe('Authentication (Firebase ID token → local profile)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  afterAll(() => app.close());

  it('rejects requests without a token', async () => {
    const res = await api(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an invalid token', async () => {
    const res = await api(app, 'not-a-token').get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('requires profile sync before using the API', async () => {
    const u = makeUser('unsynced');
    const res = await api(app, u.token).get('/auth/me');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PROFILE_REQUIRED');
  });

  it('creates the profile on first sync and is idempotent', async () => {
    const u = makeUser('sync');
    const first = await api(app, u.token).post('/auth/sync', { app: 'CUSTOMER', fullName: 'Sarah Johnson', phone: '0771234567' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ email: u.email, fullName: 'Sarah Johnson', phone: '+94771234567', platformRole: 'USER', memberships: [] });

    const second = await api(app, u.token).post('/auth/sync', { app: 'CUSTOMER', fullName: 'Someone Else' });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.fullName).toBe('Sarah Johnson');
    expect(await prisma.user.count({ where: { firebaseUid: u.uid } })).toBe(1);
    expect(await prisma.customerProfile.count({ where: { userId: first.body.id } })).toBe(1);

    const me = await api(app, u.token).get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(first.body.id);
  });

  it('validates profile input with shared schemas', async () => {
    const u = makeUser('invalid');
    const res = await api(app, u.token).post('/auth/sync', { app: 'NOPE', phone: '123' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual(['app', 'phone']);
  });

  it('blocks soft-deleted accounts', async () => {
    const u = makeUser('deleted');
    const created = await api(app, u.token).post('/auth/sync', { app: 'CUSTOMER' });
    await prisma.user.update({ where: { id: created.body.id }, data: { deletedAt: new Date() } });
    const res = await api(app, u.token).get('/auth/me');
    expect(res.status).toBe(403);
  });

  it('updates the profile', async () => {
    const u = makeUser('profile');
    await api(app, u.token).post('/auth/sync', { app: 'CUSTOMER' });
    const res = await api(app, u.token).patch('/auth/me', { fullName: 'New Name', phone: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fullName: 'New Name', phone: null });
  });
});
