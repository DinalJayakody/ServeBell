import type { INestApplication } from '@nestjs/common';
import type { FloorPlanView } from '@servebell/shared';
import { api, createTestApp, signUp } from './harness.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';

type User = Awaited<ReturnType<typeof signUp>>;

describe('Restaurant administration, floor plans, reservations, favourites and analytics', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const c = {} as { rid: string; otherRid: string; slug: string; owner: User; admin: User; waiter: User; guest: User; guest2: User; waiterMember: string; adminMember: string };
  const as = (u: User) => api(app, u.token);
  const M = (path = '') => `/restaurants/${c.rid}/manage${path}`;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    [c.owner, c.admin, c.waiter, c.guest, c.guest2] = await Promise.all([signUp(app, 'own', 'RESTAURANT'), signUp(app, 'adm', 'RESTAURANT'), signUp(app, 'wtr', 'RESTAURANT'), signUp(app, 'g1'), signUp(app, 'g2')]);
    c.slug = `mgmt${Date.now()}`;
    const r = await prisma.restaurant.create({ data: { slug: c.slug, name: 'Mgmt Place', city: 'Colombo', addressLine: 'x', status: 'DRAFT', timezone: 'Asia/Colombo' } });
    c.rid = r.id;
    c.otherRid = (await prisma.restaurant.create({ data: { slug: `${c.slug}-other`, name: 'Other', city: 'Kandy', addressLine: 'y', status: 'ACTIVE' } })).id;
    await prisma.restaurantMember.create({ data: { restaurantId: r.id, userId: c.owner.id, role: 'OWNER', employeeCode: 'EMP-1' } });
    c.adminMember = (await prisma.restaurantMember.create({ data: { restaurantId: r.id, userId: c.admin.id, role: 'ADMIN', employeeCode: 'EMP-2' } })).id;
    c.waiterMember = (await prisma.restaurantMember.create({ data: { restaurantId: r.id, userId: c.waiter.id, role: 'WAITER', employeeCode: 'EMP-3' } })).id;
  });
  afterAll(() => app.close());

  it('requires hours and a menu before going live; waiters cannot manage', async () => {
    expect((await as(c.waiter).patch(M(), { name: 'Hacked' })).status).toBe(403);
    expect((await as(c.owner).post(M('/status'), { status: 'ACTIVE' })).body.message).toMatch(/opening hours/);
    const hours = { hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensMinute: 0, closesMinute: 1440 })) };
    expect((await as(c.admin).put(M('/hours')).send(hours)).status).toBe(200);
    const cat = await as(c.owner).post(M('/menu/categories'), { name: 'Mains', kind: 'FOOD' });
    expect(cat.status).toBe(201);
    expect((await as(c.owner).post(M('/status'), { status: 'ACTIVE' })).body.message).toMatch(/menu item/);
    const item = await as(c.owner).post(M('/menu/items'), { categoryId: cat.body.id, name: 'Kottu', priceCents: 120000 });
    expect(item.status).toBe(201);
    expect((await as(c.owner).post(M('/status'), { status: 'ACTIVE' })).body.status).toBe('ACTIVE');
    expect((await as(c.owner).patch(M(`/menu/items/${item.body.id}`), { isAvailable: false })).body.isAvailable).toBe(false);
    expect((await api(app).get(`/restaurants/${c.slug}/menu`)).body.categories[0].items[0].isAvailable).toBe(false);
    expect((await as(c.owner).delete(M(`/menu/categories/${cat.body.id}`))).status).toBe(409);
  });

  it('keeps every restaurant isolated', async () => {
    const foreignCat = await prisma.menuCategory.create({ data: { restaurantId: c.otherRid, name: 'X', kind: 'FOOD' } });
    expect((await as(c.owner).patch(M(`/menu/categories/${foreignCat.id}`), { name: 'Mine now' })).status).toBe(404);
    expect((await as(c.owner).get(`/restaurants/${c.otherRid}/manage`)).status).toBe(403);
    expect((await as(c.owner).post(M('/menu/items'), { categoryId: foreignCat.id, name: 'Sneaky', priceCents: 1 })).status).toBe(404);
  });

  let plan: FloorPlanView;
  it('saves layouts with optimistic versioning, bounds checks and stable table ids', async () => {
    plan = (await as(c.owner).post(M('/floor-plans'), { name: 'Ground', widthCm: 1000, depthCm: 800 })).body;
    const base = { name: 'Ground', widthCm: 1000, depthCm: 800, objects: [{ kind: 'WALL', x: 0, y: 0, width: 1000, depth: 15 }] };
    const t = (label: string, x: number, extra = {}) => ({ label, shape: 'SQUARE', capacity: 4, x, y: 100, width: 100, depth: 100, ...extra });

    const out = await as(c.owner).put(M(`/floor-plans/${plan.id}`)).send({ ...base, expectedVersion: 0, tables: [t('T1', 950)] });
    expect(out.status).toBe(400);
    const saved = await as(c.owner).put(M(`/floor-plans/${plan.id}`)).send({ ...base, expectedVersion: 0, tables: [t('T1', 100), t('T2', 300, { capacity: 2 })] });
    expect(saved.body.version).toBe(1);
    plan = saved.body;
    const [t1, t2] = plan.tables;
    expect(await prisma.tableQrCode.count({ where: { tableId: { in: [t1!.id, t2!.id] }, status: 'ACTIVE' } })).toBe(2);

    const stale = await as(c.admin).put(M(`/floor-plans/${plan.id}`)).send({ ...base, expectedVersion: 0, tables: [] });
    expect(stale.body.code).toBe('STALE_VERSION');

    // Swap names, move T1, delete nothing → ids stay stable.
    const swapped = await as(c.owner).put(M(`/floor-plans/${plan.id}`)).send({ ...base, expectedVersion: 1, tables: [{ ...t('T2', 500), id: t1!.id }, { ...t('T1', 300, { capacity: 2 }), id: t2!.id }] });
    expect(swapped.status).toBe(200);
    expect(swapped.body.tables.find((x: { id: string }) => x.id === t1!.id).label).toBe('T2');

    // Removing a table revokes its QR.
    const removed = await as(c.owner).put(M(`/floor-plans/${plan.id}`)).send({ ...base, expectedVersion: 2, tables: [{ ...t('T2', 500), id: t1!.id }] });
    expect(removed.body.tables).toHaveLength(1);
    expect(await prisma.tableQrCode.count({ where: { tableId: t2!.id, status: 'ACTIVE' } })).toBe(0);
    plan = removed.body;

    expect((await api(app).get(`/restaurants/${c.slug}/floor-plans`)).body).toEqual([]);
    expect((await as(c.owner).post(M(`/floor-plans/${plan.id}/publish`), { publish: true })).body.status).toBe('PUBLISHED');
    const pub = (await api(app).get(`/restaurants/${c.slug}/floor-plans`)).body as FloorPlanView[];
    expect(pub[0]!.tables[0]).toMatchObject({ id: t1!.id, label: 'T2', status: 'AVAILABLE' });
    expect(pub[0]!.objects[0]!.kind).toBe('WALL');
  });

  it('keeps drafts private until saved for real; supports screens and TVs', async () => {
    const cur = (await as(c.owner).get(M('/floor-plans'))).body[0] as FloorPlanView;
    const draft = { baseVersion: cur.version, name: cur.name, widthCm: cur.widthCm, depthCm: cur.depthCm, tables: [], objects: [{ kind: 'SCREEN', x: 100, y: 0, width: 300, depth: 20 }, { kind: 'TV', x: 500, y: 0, width: 120, depth: 40 }] };
    expect((await as(c.waiter).put(M(`/floor-plans/${cur.id}/draft`)).send(draft)).status).toBe(403);
    expect((await as(c.owner).put(M(`/floor-plans/${cur.id}/draft`)).send(draft)).status).toBe(200);
    const staff = (await as(c.owner).get(M('/floor-plans'))).body[0] as FloorPlanView;
    expect(staff.draft?.objects).toHaveLength(2);
    expect(staff.draftSavedAt).toBeTruthy();
    expect(staff.tables.length).toBe(cur.tables.length); // live layout untouched
    const pub = (await api(app).get(`/restaurants/${c.slug}/floor-plans`)).body[0];
    expect(pub.draft).toBeUndefined();
    // Saving for real applies the layout and clears the draft.
    const keep = cur.tables.map(({ id, label, shape, capacity, x, y, width, depth }) => ({ id, label, shape, capacity, x, y, width, depth }));
    const saved = await as(c.owner).put(M(`/floor-plans/${cur.id}`)).send({ expectedVersion: cur.version, name: cur.name, widthCm: cur.widthCm, depthCm: cur.depthCm, tables: keep, objects: draft.objects });
    expect(saved.status).toBe(200);
    expect(saved.body.objects.map((o: { kind: string }) => o.kind).sort()).toEqual(['SCREEN', 'TV']);
    expect(saved.body.draft).toBeNull();
    expect((await as(c.owner).put(M(`/floor-plans/${cur.id}/draft`)).send(draft)).status).toBe(200);
    expect((await as(c.owner).delete(M(`/floor-plans/${cur.id}/draft`))).status).toBe(204);
    expect(((await as(c.owner).get(M('/floor-plans'))).body[0] as FloorPlanView).draft).toBeNull();
    plan = saved.body;
  });

  it('regenerates and deactivates QR codes; old stickers stop working', async () => {
    const tableId = plan.tables[0]!.id;
    const before = (await as(c.owner).get(M('/qr-codes'))).body[0];
    expect(before.svg).toContain('<svg');
    const oldToken = before.url.split('/t/')[1];
    const after = (await as(c.owner).post(M(`/tables/${tableId}/qr/regenerate`))).body;
    expect(after.version).toBe(before.version + 1);
    expect((await api(app).get(`/qr/${oldToken}`)).status).toBe(404);
    expect((await api(app).get(`/qr/${after.url.split('/t/')[1]}`)).status).toBe(200);
    expect((await as(c.owner).get(M('/qr-codes/print'))).text).toContain('Table T2');
    expect((await as(c.waiter).get(M('/qr-codes'))).status).toBe(403);
  });

  it('offers real availability and makes simultaneous double booking impossible', async () => {
    const tableId = plan.tables[0]!.id;
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(Date.now() + 86_400_000));
    const slots = (await api(app).get(`/tables/${tableId}/availability?date=${tomorrow}&partySize=2`)).body;
    expect(slots.length).toBeGreaterThan(10);
    const slot = slots[20];
    expect((await api(app).get(`/tables/${tableId}/availability?date=${tomorrow}&partySize=9`)).body).toEqual([]);

    const book = (u: User) => as(u).post('/reservations', { tableId, startsAt: slot.startsAt, partySize: 2 });
    const [a, b] = await Promise.all([book(c.guest), book(c.guest2)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const winner = a.status === 201 ? a : b;
    const loser = a.status === 201 ? b : a;
    expect(loser.body.code).toBe('TABLE_UNAVAILABLE');
    const again = (await api(app).get(`/tables/${tableId}/availability?date=${tomorrow}&partySize=2`)).body;
    expect(again[20].available).toBe(false);

    expect((await as(c.waiter).post(`/restaurants/${c.rid}/reservations/${winner.body.id}/status`, { status: 'CONFIRMED' })).status).toBe(403);
    expect((await as(c.admin).post(`/restaurants/${c.rid}/reservations/${winner.body.id}/status`, { status: 'CONFIRMED' })).body.status).toBe('CONFIRMED');
    expect((await as(c.waiter).get(`/restaurants/${c.rid}/reservations?date=${tomorrow}`)).body).toHaveLength(1);
    const winnerUser = a.status === 201 ? c.guest : c.guest2;
    expect((await as(winnerUser).post(`/reservations/${winner.body.id}/cancel`)).body.status).toBe('CANCELLED');
    expect((await api(app).get(`/tables/${tableId}/availability?date=${tomorrow}&partySize=2`)).body[20].available).toBe(true);
    expect((await as(c.guest).post('/reservations', { tableId, startsAt: new Date(Date.now() + 60_000).toISOString(), partySize: 2 })).status).toBe(400);
  });

  it('works without a floor plan: simple tables, any-table reservations, table assignment', async () => {
    expect((await as(c.waiter).post(M('/tables'), { label: 'Patio 1', capacity: 6 })).status).toBe(403);
    const patio = await as(c.owner).post(M('/tables'), { label: 'Patio 1', capacity: 6, zone: 'Patio' });
    expect(patio.status).toBe(201);
    expect(patio.body).toMatchObject({ floorPlanId: null, status: 'AVAILABLE' });
    expect(await prisma.tableQrCode.count({ where: { tableId: patio.body.id, status: 'ACTIVE' } })).toBe(1);
    expect((await as(c.owner).post(M('/tables'), { label: 'patio 1', capacity: 2 })).status).toBe(409);
    expect((await as(c.waiter).get(M('/tables'))).body.map((t: { label: string }) => t.label)).toEqual(['Patio 1', 'T2']);

    const detail = (await api(app).get(`/restaurants/${c.slug}`)).body;
    expect(detail).toMatchObject({ acceptsReservations: true, reservableTables: 2 });
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(Date.now() + 86_400_000));
    const slots = (await api(app).get(`/restaurants/${c.slug}/availability?date=${tomorrow}&partySize=6`)).body;
    const slot = slots[24];
    expect(slot.available).toBe(true);
    expect((await api(app).get(`/restaurants/${c.slug}/availability?date=${tomorrow}&partySize=12`)).body).toEqual([]);

    // Only Patio 1 seats six, so a second any-table request for that slot is refused.
    const first = await as(c.guest).post('/reservations', { restaurantId: c.rid, startsAt: slot.startsAt, partySize: 6 });
    expect(first.status).toBe(201);
    expect(first.body.table).toBeNull();
    expect((await as(c.guest2).post('/reservations', { restaurantId: c.rid, startsAt: slot.startsAt, partySize: 6 })).status).toBe(400);
    expect((await as(c.guest2).post('/reservations', { startsAt: slot.startsAt, partySize: 2 })).status).toBe(400);

    const R = `/restaurants/${c.rid}/reservations/${first.body.id}/status`;
    expect((await as(c.owner).post(R, { status: 'CONFIRMED', tableId: plan.tables[0]!.id })).body.message).toMatch(/seats up to 4/);
    const confirmed = await as(c.owner).post(R, { status: 'CONFIRMED', tableId: patio.body.id });
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED', table: { label: 'Patio 1' } });

    expect((await as(c.owner).put(M(`/tables/${patio.body.id}/basics`)).send({ label: 'Garden 1', capacity: 8 })).body).toMatchObject({ label: 'Garden 1', capacity: 8 });
    // Unplaced tables can be placed on a plan later; names stay unique across the restaurant.
    await as(c.owner).post(M('/tables'), { label: 'Bar 9', capacity: 2 });
    const cur = (await as(c.owner).get(M('/floor-plans'))).body[0] as FloorPlanView;
    const keep = cur.tables.map(({ id, label, shape, capacity, x, y, width, depth }) => ({ id, label, shape, capacity, x, y, width, depth }));
    const placeGarden = { id: patio.body.id, label: 'Garden 1', shape: 'SQUARE', capacity: 8, x: 600, y: 500, width: 100, depth: 100 };
    const base = { name: cur.name, widthCm: cur.widthCm, depthCm: cur.depthCm, objects: [] };
    const dup = await as(c.owner).put(M(`/floor-plans/${cur.id}`)).send({ ...base, expectedVersion: cur.version, tables: [...keep, placeGarden, { label: 'bar 9', shape: 'ROUND', capacity: 2, x: 300, y: 500, width: 70, depth: 70 }] });
    expect(dup.status).toBe(409);
    const placed = await as(c.owner).put(M(`/floor-plans/${cur.id}`)).send({ ...base, expectedVersion: cur.version, tables: [...keep, placeGarden] });
    expect(placed.status).toBe(200);
    expect((await as(c.owner).get(M('/tables'))).body.find((x: { id: string }) => x.id === patio.body.id).floorPlanId).toBe(cur.id);

    expect((await as(c.owner).delete(M(`/tables/${patio.body.id}`))).status).toBe(204);
    expect(await prisma.tableQrCode.count({ where: { tableId: patio.body.id, status: 'ACTIVE' } })).toBe(0);

    // Photo detection is optional: without an API key it explains itself instead of failing.
    const det = await as(c.owner).post(M(`/floor-plans/${plan.id}/detect`), { fileId: '00000000-0000-7000-8000-000000000000' });
    expect(det.status).toBe(503);
    expect(det.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('manages favourites idempotently', async () => {
    expect((await as(c.guest).put(`/favourites/${c.rid}`)).status).toBe(204);
    expect((await as(c.guest).put(`/favourites/${c.rid}`)).status).toBe(204);
    expect((await as(c.guest).get('/favourites')).body).toHaveLength(1);
    expect((await as(c.guest).get(`/restaurants/${c.slug}`)).body.isFavourite).toBe(true);
    expect((await as(c.guest).delete(`/favourites/${c.rid}`)).status).toBe(204);
    expect((await as(c.guest).get('/favourites')).body).toHaveLength(0);
  });

  it('derives analytics and employee metrics from real data, with filters', async () => {
    const tableId = plan.tables[0]!.id;
    const qr = await prisma.tableQrCode.findFirstOrThrow({ where: { tableId, status: 'ACTIVE' } });
    const st = await prisma.serviceType.create({ data: { restaurantId: c.rid, kind: 'WAITER', name: 'Waiter', isPrimary: true } });
    await as(c.guest).post('/visits', { qr: qr.token });
    const r1 = (await as(c.guest).post('/services', { serviceTypeId: st.id, idempotencyKey: 'an-key-0001' })).body;
    await as(c.waiter).post(`/restaurants/${c.rid}/services/${r1.id}/accept`);
    await as(c.waiter).post(`/restaurants/${c.rid}/services/${r1.id}/complete`);

    const s = (await as(c.owner).get(`/restaurants/${c.rid}/analytics/summary`)).body;
    expect(s.services).toMatchObject({ total: 1, completed: 1 });
    expect(s.services.avgAcceptMs).toBeGreaterThanOrEqual(0);
    expect(s.byType[0]).toMatchObject({ name: 'Waiter', count: 1 });
    expect(s.leaderboard[0]).toMatchObject({ memberId: c.waiterMember, completed: 1 });
    expect((await as(c.owner).get(`/restaurants/${c.rid}/analytics/summary?memberId=${c.adminMember}`)).body.services.total).toBe(0);
    expect((await as(c.waiter).get(`/restaurants/${c.rid}/analytics/summary`)).status).toBe(403);

    const cards = (await as(c.admin).get(`/restaurants/${c.rid}/employees`)).body;
    expect(cards.find((e: { memberId: string }) => e.memberId === c.waiterMember).today.completed).toBe(1);
    const profile = (await as(c.owner).get(`/restaurants/${c.rid}/employees/${c.waiterMember}`)).body;
    expect(profile.requests[0]).toMatchObject({ id: r1.id, status: 'COMPLETED', table: 'T2' });
  });

  it('applies owner/admin rules when managing employees', async () => {
    const owner = (await prisma.restaurantMember.findFirstOrThrow({ where: { restaurantId: c.rid, role: 'OWNER' } })).id;
    expect((await as(c.admin).patch(`/restaurants/${c.rid}/employees/${owner}`, { status: 'SUSPENDED' })).status).toBe(403);
    expect((await as(c.admin).patch(`/restaurants/${c.rid}/employees/${c.waiterMember}`, { role: 'ADMIN' })).status).toBe(403);
    expect((await as(c.admin).patch(`/restaurants/${c.rid}/employees/${c.waiterMember}`, { status: 'SUSPENDED' })).body.status).toBe('SUSPENDED');
    expect((await as(c.waiter).get(`/restaurants/${c.rid}/services`)).status).toBe(403);
    expect((await as(c.owner).patch(`/restaurants/${c.rid}/employees/${c.waiterMember}`, { status: 'ACTIVE' })).body.status).toBe('ACTIVE');
  });
});
