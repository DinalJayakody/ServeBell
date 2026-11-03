import type { INestApplication } from '@nestjs/common';
import { RealtimeEvent, topics } from '@servebell/shared';
import { api, createTestApp, signUp, type RecordingPublisher } from './harness.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import { EscalationJob } from '../src/services/escalation.job.js';

type User = Awaited<ReturnType<typeof signUp>>;

describe('Visits and the service request lifecycle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let realtime: RecordingPublisher;
  const ctx = {} as {
    restaurantId: string; otherRestaurantId: string; qr: string; qr2: string; otherQr: string;
    waiterTypeId: string; waterTypeId: string; otherTypeId: string;
    owner: User; waiterA: User; waiterB: User; outsider: User; customer: User; customer2: User;
    memberA: string; memberB: string;
  };

  async function restaurant(label: string, staff: { user: User; role: 'OWNER' | 'WAITER' }[]) {
    const tag = `${label}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const r = await prisma.restaurant.create({
      data: {
        slug: tag, name: `${label} Diner`, city: 'Colombo', addressLine: 'x', status: 'ACTIVE', escalationMinutes: 15,
        serviceTypes: { create: [{ kind: 'WAITER', name: 'Request a waiter', isPrimary: true }, { kind: 'WATER', name: 'Water', sortOrder: 1 }] },
      },
      include: { serviceTypes: true },
    });
    const t1 = await prisma.restaurantTable.create({ data: { restaurantId: r.id, label: 'T4', capacity: 4 } });
    const t2 = await prisma.restaurantTable.create({ data: { restaurantId: r.id, label: 'T5', capacity: 2 } });
    const q1 = await prisma.tableQrCode.create({ data: { restaurantId: r.id, tableId: t1.id, version: 1, token: `${tag}-qr-table-4` } });
    const q2 = await prisma.tableQrCode.create({ data: { restaurantId: r.id, tableId: t2.id, version: 1, token: `${tag}-qr-table-5` } });
    const members: string[] = [];
    for (const [i, s] of staff.entries()) {
      const m = await prisma.restaurantMember.create({ data: { restaurantId: r.id, userId: s.user.id, role: s.role, employeeCode: `EMP-${i + 1}` } });
      members.push(m.id);
    }
    return { r, q1, q2, members };
  }

  beforeAll(async () => {
    ({ app, prisma, realtime } = await createTestApp());
    ctx.owner = await signUp(app, 'own', 'RESTAURANT');
    ctx.waiterA = await signUp(app, 'wa', 'RESTAURANT');
    ctx.waiterB = await signUp(app, 'wb', 'RESTAURANT');
    ctx.outsider = await signUp(app, 'out', 'RESTAURANT');
    ctx.customer = await signUp(app, 'cust');
    ctx.customer2 = await signUp(app, 'cust2');
    const main = await restaurant('Main', [{ user: ctx.owner, role: 'OWNER' }, { user: ctx.waiterA, role: 'WAITER' }, { user: ctx.waiterB, role: 'WAITER' }]);
    const other = await restaurant('Other', [{ user: ctx.outsider, role: 'WAITER' }]);
    Object.assign(ctx, {
      restaurantId: main.r.id, qr: main.q1.token, qr2: main.q2.token, otherRestaurantId: other.r.id, otherQr: other.q1.token,
      waiterTypeId: main.r.serviceTypes.find((s) => s.kind === 'WAITER')!.id,
      waterTypeId: main.r.serviceTypes.find((s) => s.kind === 'WATER')!.id,
      otherTypeId: other.r.serviceTypes[0]!.id,
      memberA: main.members[1], memberB: main.members[2],
    });
  });
  afterAll(() => app.close());

  const staff = (u: User, path: string, body?: object) => api(app, u.token).post(`/restaurants/${ctx.restaurantId}/services${path}`, body);
  const queue = async (u: User, view: string) => (await api(app, u.token).get(`/restaurants/${ctx.restaurantId}/services?view=${view}`)).body.items as ServiceRequestView[];
  const request = (u: User, serviceTypeId: string, key: string, note?: string) => api(app, u.token).post('/services', { serviceTypeId, idempotencyKey: key, note });

  it('requires an active visit, started from any form of the QR link', async () => {
    const denied = await request(ctx.customer, ctx.waiterTypeId, 'no-visit-key-1');
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('VISIT_REQUIRED');

    expect((await api(app, ctx.customer.token).post('/visits', { qr: 'https://evil.example/t/unknown-token-0000' })).body.code).toBe('QR_INVALID');
    const visit = await api(app, ctx.customer.token).post('/visits', { qr: `exp://192.168.1.5:8081/--/t/${ctx.qr}` });
    expect(visit.status).toBe(201);
    expect(visit.body).toMatchObject({ status: 'ACTIVE', table: { label: 'T4' }, restaurant: { id: ctx.restaurantId } });
    expect(visit.body.services[0]).toMatchObject({ kind: 'WAITER', isPrimary: true });

    // Re-scanning the same table keeps the same session.
    const again = await api(app, ctx.customer.token).post('/visits', { qr: ctx.qr });
    expect(again.body.id).toBe(visit.body.id);
    expect((await api(app, ctx.customer.token).get('/visits/active')).body.visit.id).toBe(visit.body.id);
  });

  it('cannot request another restaurant’s services from my table', async () => {
    expect((await request(ctx.customer, ctx.otherTypeId, 'cross-restaurant-1')).status).toBe(404);
  });

  let requestId = '';
  it('creates a request idempotently and de-duplicates open requests of the same type', async () => {
    const first = await request(ctx.customer, ctx.waiterTypeId, 'idem-key-0001', 'Could we see the dessert menu?');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: 'PENDING', duplicate: false, table: { label: 'T4' }, acceptedBy: null });
    requestId = first.body.id;

    const retry = await request(ctx.customer, ctx.waiterTypeId, 'idem-key-0001');
    expect(retry.body).toMatchObject({ id: requestId, duplicate: true });
    const sameType = await request(ctx.customer, ctx.waiterTypeId, 'idem-key-0002');
    expect(sameType.body).toMatchObject({ id: requestId, duplicate: true });
    expect(await prisma.serviceRequest.count({ where: { customerId: ctx.customer.id } })).toBe(1);

    // Staff were notified in-app (push rows only exist for registered devices).
    const n = await prisma.notification.findMany({ where: { dedupeKey: `service.created:${requestId}` } });
    expect(n.map((x) => x.userId).sort()).toEqual([ctx.owner.id, ctx.waiterA.id, ctx.waiterB.id].sort());
  });

  it('"Wait" hides the request for one waiter only and never cancels it', async () => {
    expect((await queue(ctx.waiterA, 'pending')).map((r) => r.id)).toContain(requestId);
    const waited = await staff(ctx.waiterA, `/${requestId}/wait`);
    expect(waited.status).toBe(201);
    expect(waited.body).toMatchObject({ status: 'PENDING', dismissedByMe: true });
    expect((await queue(ctx.waiterA, 'pending')).map((r) => r.id)).not.toContain(requestId);
    expect((await queue(ctx.waiterA, 'others')).map((r) => r.id)).toContain(requestId);
    expect((await queue(ctx.waiterB, 'pending')).map((r) => r.id)).toContain(requestId);
  });

  it('staff of another restaurant cannot see or accept it', async () => {
    expect((await api(app, ctx.outsider.token).post(`/restaurants/${ctx.restaurantId}/services/${requestId}/accept`)).status).toBe(403);
    expect((await api(app, ctx.outsider.token).get(`/services/${requestId}`)).status).toBe(404);
    expect((await api(app, ctx.customer2.token).get(`/services/${requestId}`)).status).toBe(404);
  });

  it('lets exactly one of two simultaneous waiters accept, and pushes realtime updates', async () => {
    const sentBefore = realtime.sent.length;
    const [a, b] = await Promise.all([staff(ctx.waiterA, `/${requestId}/accept`), staff(ctx.waiterB, `/${requestId}/accept`)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('ALREADY_ACCEPTED');

    // Exactly one acceptance is announced, to the restaurant's staff and to the customer.
    const accepted = realtime.sent.slice(sentBefore).filter((m) => m.event === RealtimeEvent.SERVICE_ACCEPTED);
    expect(accepted.map((m) => m.topic).sort()).toEqual([topics.restaurantStaff(ctx.restaurantId), topics.user(ctx.customer.id)].sort());
    expect(accepted[0]!.payload).toMatchObject({ event: RealtimeEvent.SERVICE_ACCEPTED, restaurantId: ctx.restaurantId, data: { id: requestId, status: 'ACCEPTED' } });

    const row = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.acceptedAt).not.toBeNull();
    expect(await prisma.serviceDismissal.count({ where: { requestId } })).toBe(0);
    ctx.memberA = row.acceptedById!;
  });

  it('only the assignee (or an owner) can progress it; timestamps and audit trail are server-side', async () => {
    const row = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { acceptedBy: true } });
    const assignee = row.acceptedBy!.userId === ctx.waiterA.id ? ctx.waiterA : ctx.waiterB;
    const other = assignee === ctx.waiterA ? ctx.waiterB : ctx.waiterA;

    expect((await staff(other, `/${requestId}/complete`)).status).toBe(409);
    expect((await staff(assignee, `/${requestId}/start`)).body.status).toBe('IN_PROGRESS');
    const done = await staff(assignee, `/${requestId}/complete`);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.completedBy.memberId).toBe(row.acceptedById);
    expect((await staff(assignee, `/${requestId}/complete`)).body.code).toBe('INVALID_TRANSITION');

    const detail = await api(app, ctx.customer.token).get(`/services/${requestId}`);
    expect(detail.body.events.map((e: { type: string }) => e.type)).toEqual(['CREATED', 'ACCEPTED', 'STARTED', 'COMPLETED']);
    const t = detail.body;
    expect(new Date(t.createdAt) <= new Date(t.acceptedAt) && new Date(t.acceptedAt) <= new Date(t.startedAt) && new Date(t.startedAt) <= new Date(t.completedAt)).toBe(true);

    const stats = (await api(app, assignee.token).get(`/restaurants/${ctx.restaurantId}/services/stats/me`)).body;
    expect(stats.completedToday).toBe(1);
    expect(stats.avgAcceptMs).toBeGreaterThanOrEqual(0);
    expect(stats.avgCompleteMs).toBeGreaterThanOrEqual(stats.avgAcceptMs);

    const customerNotes = await prisma.notification.findMany({ where: { userId: ctx.customer.id }, orderBy: { createdAt: 'asc' } });
    expect(customerNotes.map((n) => n.type)).toEqual(['service.accepted', 'service.in_progress', 'service.completed']);
  });

  it('supports conversation between customer and assigned waiter; admins can audit', async () => {
    const r = await request(ctx.customer, ctx.waterTypeId, 'msg-key-00001');
    const id = r.body.id as string;
    await staff(ctx.waiterA, `/${id}/accept`);

    const sent = await api(app, ctx.customer.token).post(`/services/${id}/messages`, { body: 'Sparkling please', clientMessageId: 'client-msg-1' });
    expect(sent.status).toBe(201);
    const dup = await api(app, ctx.customer.token).post(`/services/${id}/messages`, { body: 'Sparkling please', clientMessageId: 'client-msg-1' });
    expect(dup.body.id).toBe(sent.body.id);
    expect((await api(app, ctx.waiterA.token).post(`/services/${id}/messages`, { body: 'Coming right up', clientMessageId: 'client-msg-2' })).status).toBe(201);
    expect((await api(app, ctx.waiterB.token).post(`/services/${id}/messages`, { body: 'Hi', clientMessageId: 'client-msg-3' })).status).toBe(403);

    const audit = await api(app, ctx.owner.token).get(`/services/${id}/messages`);
    expect(audit.body.map((m: { senderRole: string; body: string }) => `${m.senderRole}:${m.body}`)).toEqual([
      'SYSTEM:Water requested for table T4.',
      expect.stringMatching(/^SYSTEM:.* is on the way\.$/),
      'CUSTOMER:Sparkling please',
      'STAFF:Coming right up',
    ]);

    const cancelled = await api(app, ctx.customer.token).post(`/services/${id}/cancel`, {});
    expect(cancelled.body.status).toBe('CANCELLED');
    expect((await api(app, ctx.customer.token).post(`/services/${id}/messages`, { body: 'x', clientMessageId: 'client-msg-4' })).status).toBe(409);
  });

  it('escalates overdue requests exactly once per threshold', async () => {
    const r = await request(ctx.customer, ctx.waiterTypeId, 'escalate-key-1');
    const id = r.body.id as string;
    const job = app.get(EscalationJob);
    await prisma.serviceRequest.update({ where: { id }, data: { createdAt: new Date(Date.now() - 16 * 60_000) } });

    await Promise.all([job.run(), job.run()]);
    await job.run();
    let row = await prisma.serviceRequest.findUniqueOrThrow({ where: { id } });
    expect(row.escalationLevel).toBe(1);
    expect(await prisma.notification.count({ where: { dedupeKey: `service.escalated:${id}:1` } })).toBe(3);

    await prisma.serviceRequest.update({ where: { id }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    await job.run();
    row = await prisma.serviceRequest.findUniqueOrThrow({ where: { id } });
    expect(row.escalationLevel).toBe(2);
    expect(await prisma.serviceRequestEvent.count({ where: { requestId: id, type: 'ESCALATED' } })).toBe(2);

    // Escalated requests jump to the top of the queue.
    expect((await queue(ctx.waiterB, 'pending'))[0]!.id).toBe(id);
  });

  it('restricts the "all" monitoring view to owners/admins', async () => {
    expect((await api(app, ctx.waiterA.token).get(`/restaurants/${ctx.restaurantId}/services?view=all`)).status).toBe(403);
    expect((await api(app, ctx.owner.token).get(`/restaurants/${ctx.restaurantId}/services?view=all`)).body.items.length).toBeGreaterThanOrEqual(3);
  });

  it('moving to another table ends the previous visit; leaving ends the session', async () => {
    const first = (await api(app, ctx.customer2.token).post('/visits', { qr: ctx.qr })).body;
    const second = (await api(app, ctx.customer2.token).post('/visits', { qr: ctx.qr2 })).body;
    expect(second.id).not.toBe(first.id);
    expect((await prisma.restaurantVisit.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('ENDED');
    expect((await api(app, ctx.customer2.token).post(`/visits/${second.id}/leave`)).status).toBe(204);
    expect((await api(app, ctx.customer2.token).get('/visits/active')).body.visit).toBeNull();
    expect((await request(ctx.customer2, ctx.waiterTypeId, 'after-leave-01')).body.code).toBe('VISIT_REQUIRED');
  });

  it('never sends one restaurant\'s events to another restaurant\'s staff topic', async () => {
    const leaked = realtime.sent.filter((m) => m.topic === topics.restaurantStaff(ctx.otherRestaurantId) && m.payload.restaurantId === ctx.restaurantId);
    expect(leaked).toEqual([]);
    expect(realtime.sent.every((m) => /^(restaurant|service|user):[0-9a-f-]{36}$/.test(m.topic))).toBe(true);
  });
});
