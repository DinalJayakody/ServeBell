import type { INestApplication } from '@nestjs/common';
import { api, createTestApp, makeUser, signUp } from './harness.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';

describe('Owner onboarding, invitations, roles and restaurant isolation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformAdmin: Awaited<ReturnType<typeof signUp>>;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    platformAdmin = await signUp(app, 'platform', 'RESTAURANT');
    await prisma.user.update({ where: { id: platformAdmin.id }, data: { platformRole: 'PLATFORM_ADMIN' } });
  });
  afterAll(() => app.close());

  async function createRestaurant(label: string) {
    const owner = await signUp(app, `${label}-owner`, 'RESTAURANT');
    const applied = await api(app, owner.token).post('/onboarding/owner-applications', {
      restaurantName: `${label} Bistro`, addressLine: '1 Main Street', city: 'Colombo', phone: '0112345678',
    });
    expect(applied.status).toBe(201);
    const reviewed = await api(app, platformAdmin.token).post(`/onboarding/owner-applications/${applied.body.id}/review`, { decision: 'APPROVED' });
    expect(reviewed.status).toBe(201);
    return { owner, restaurantId: reviewed.body.restaurantId as string };
  }

  async function invite(token: string, restaurantId: string, email: string, role: 'ADMIN' | 'WAITER') {
    return api(app, token).post(`/restaurants/${restaurantId}/invitations`, { email, role });
  }

  it('does not let a normal user review owner applications', async () => {
    const owner = await signUp(app, 'sneaky', 'RESTAURANT');
    const applied = await api(app, owner.token).post('/onboarding/owner-applications', {
      restaurantName: 'Sneaky Cafe', addressLine: '2 Side Street', city: 'Kandy', phone: '0812345678',
    });
    const res = await api(app, owner.token).post(`/onboarding/owner-applications/${applied.body.id}/review`, { decision: 'APPROVED' });
    expect(res.status).toBe(403);
    expect(await prisma.restaurantMember.count({ where: { userId: owner.id } })).toBe(0);
  });

  it('approval creates the restaurant, OWNER membership and default services', async () => {
    const { owner, restaurantId } = await createRestaurant('approve');
    const me = await api(app, owner.token).get('/auth/me');
    expect(me.body.memberships).toEqual([expect.objectContaining({ restaurantId, role: 'OWNER', employeeCode: 'EMP-0001' })]);
    const services = await prisma.serviceType.findMany({ where: { restaurantId } });
    expect(services.find((s) => s.isPrimary)?.kind).toBe('WAITER');
    // Admins were alerted about the application; the owner about the approval.
    expect(await prisma.notification.count({ where: { userId: platformAdmin.id, type: 'onboarding.applied' } })).toBeGreaterThan(0);
    expect(await prisma.notification.count({ where: { userId: owner.id, type: 'onboarding.approved' } })).toBe(1);
  });

  it('prevents reviewing the same application twice', async () => {
    const owner = await signUp(app, 'twice', 'RESTAURANT');
    const applied = await api(app, owner.token).post('/onboarding/owner-applications', {
      restaurantName: 'Twice Grill', addressLine: '3 Road', city: 'Galle', phone: '0912345678',
    });
    const url = `/onboarding/owner-applications/${applied.body.id}/review`;
    const [a, b] = await Promise.all([
      api(app, platformAdmin.token).post(url, { decision: 'APPROVED' }),
      api(app, platformAdmin.token).post(url, { decision: 'APPROVED' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.restaurantMember.count({ where: { userId: owner.id, role: 'OWNER' } })).toBe(1);
  });

  it('runs the full invitation flow and enforces role permissions server-side', async () => {
    const { owner, restaurantId } = await createRestaurant('invite');
    const waiter = makeUser('waiter');
    await api(app, waiter.token).post('/auth/sync', { app: 'RESTAURANT', fullName: 'Daniel Perera' });

    const inv = await invite(owner.token, restaurantId, waiter.email, 'WAITER');
    expect(inv.status).toBe(201);
    expect(inv.body.code).toMatch(/^[A-Z2-9]{8}$/);

    const redeemed = await api(app, waiter.token).post('/invitations/redeem', { invitationCode: inv.body.code.toLowerCase() });
    expect(redeemed.status).toBe(201);
    expect(redeemed.body.user.memberships[0]).toMatchObject({ restaurantId, role: 'WAITER', employeeCode: 'EMP-0002' });

    // Codes are single-use.
    const reuse = await api(app, waiter.token).post('/invitations/redeem', { invitationCode: inv.body.code });
    expect(reuse.status).toBe(400);

    // A waiter calling owner APIs directly is refused.
    expect((await invite(waiter.token, restaurantId, 'x@test.dev', 'WAITER')).status).toBe(403);
    expect((await api(app, waiter.token).get(`/restaurants/${restaurantId}/invitations`)).status).toBe(403);
  });

  it('requires a verified email to join a team or apply as an owner', async () => {
    const { owner, restaurantId } = await createRestaurant('verify');
    const u = makeUser('unverified');
    const token = `${u.token}:unverified`;
    await api(app, token).post('/auth/sync', { app: 'RESTAURANT' });
    const inv = await invite(owner.token, restaurantId, u.email, 'WAITER');
    const redeem = await api(app, token).post('/invitations/redeem', { invitationCode: inv.body.code });
    expect(redeem.status).toBe(403);
    expect(redeem.body.code).toBe('EMAIL_NOT_VERIFIED');
    const apply = await api(app, token).post('/onboarding/owner-applications', { restaurantName: 'Fake Place', addressLine: '1 Road', city: 'Colombo', phone: '0112345678' });
    expect(apply.body.code).toBe('EMAIL_NOT_VERIFIED');
    // Once verified (same Firebase user), the same code works.
    expect((await api(app, u.token).post('/invitations/redeem', { invitationCode: inv.body.code })).status).toBe(201);
  });

  it('binds invitation codes to the invited email', async () => {
    const { owner, restaurantId } = await createRestaurant('bound');
    const intended = makeUser('intended');
    const thief = await signUp(app, 'thief', 'RESTAURANT');
    const inv = await invite(owner.token, restaurantId, intended.email, 'WAITER');
    const res = await api(app, thief.token).post('/invitations/redeem', { invitationCode: inv.body.code });
    expect(res.status).toBe(400);
    expect(await prisma.restaurantMember.count({ where: { userId: thief.id } })).toBe(0);
  });

  it('only owners can invite administrators', async () => {
    const { owner, restaurantId } = await createRestaurant('admins');
    const manager = await signUp(app, 'manager', 'RESTAURANT');
    const inv = await invite(owner.token, restaurantId, manager.email, 'ADMIN');
    await api(app, manager.token).post('/invitations/redeem', { invitationCode: inv.body.code });

    expect((await invite(manager.token, restaurantId, 'w@test.dev', 'WAITER')).status).toBe(201);
    expect((await invite(manager.token, restaurantId, 'a@test.dev', 'ADMIN')).status).toBe(403);
  });

  it('isolates restaurants: an owner of A has no access to B', async () => {
    const a = await createRestaurant('iso-a');
    const b = await createRestaurant('iso-b');
    expect((await api(app, a.owner.token).get(`/restaurants/${b.restaurantId}/invitations`)).status).toBe(403);
    expect((await invite(a.owner.token, b.restaurantId, 'x@test.dev', 'WAITER')).status).toBe(403);
    expect((await api(app, a.owner.token).get(`/restaurants/${a.restaurantId}/invitations`)).status).toBe(200);
  });

  it('revokes access immediately when a member is suspended', async () => {
    const { owner, restaurantId } = await createRestaurant('suspend');
    await prisma.restaurantMember.updateMany({ where: { restaurantId, userId: owner.id }, data: { status: 'SUSPENDED' } });
    expect((await api(app, owner.token).get(`/restaurants/${restaurantId}/invitations`)).status).toBe(403);
  });

  it('rejects malformed restaurant ids without querying', async () => {
    const { owner } = await createRestaurant('malformed');
    expect((await api(app, owner.token).get('/restaurants/not-a-uuid/invitations')).status).toBe(403);
  });
});
