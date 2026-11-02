import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import type { MenuView, OrderView } from '@servebell/shared';
import { api, createTestApp, signUp } from './harness.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';

type User = Awaited<ReturnType<typeof signUp>>;

describe('Menu, ordering and uploads', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ctx = {} as { rid: string; slug: string; qr: string; customer: User; waiter: User; outsider: User; pizza: string; regular: string; large: string; lemonade: string; offItem: string };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    ctx.customer = await signUp(app, 'diner');
    ctx.waiter = await signUp(app, 'kitchen', 'RESTAURANT');
    ctx.outsider = await signUp(app, 'stranger', 'RESTAURANT');
    ctx.slug = `menu${Date.now()}`;
    const r = await prisma.restaurant.create({ data: { slug: ctx.slug, name: 'Menu Place', city: 'Colombo', addressLine: 'x', status: 'ACTIVE' } });
    ctx.rid = r.id;
    await prisma.restaurantMember.create({ data: { restaurantId: r.id, userId: ctx.waiter.id, role: 'WAITER', employeeCode: 'EMP-1' } });
    const t = await prisma.restaurantTable.create({ data: { restaurantId: r.id, label: 'T12', capacity: 4 } });
    ctx.qr = (await prisma.tableQrCode.create({ data: { restaurantId: r.id, tableId: t.id, version: 1, token: `${ctx.slug}-table-twelve` } })).token;
    const mains = await prisma.menuCategory.create({ data: { restaurantId: r.id, name: 'Main Course', kind: 'FOOD' } });
    const drinks = await prisma.menuCategory.create({ data: { restaurantId: r.id, name: 'Drinks', kind: 'DRINK', sortOrder: 1 } });
    const pizza = await prisma.menuItem.create({
      data: { restaurantId: r.id, categoryId: mains.id, name: 'Margherita Pizza', priceCents: 185_000, optionGroups: { create: { name: 'Size', minSelect: 1, maxSelect: 1, options: { create: [{ name: 'Regular' }, { name: 'Large', priceDeltaCents: 60_000 }] } } } },
      include: { optionGroups: { include: { options: true } } },
    });
    ctx.pizza = pizza.id;
    ctx.regular = pizza.optionGroups[0]!.options.find((o) => o.name === 'Regular')!.id;
    ctx.large = pizza.optionGroups[0]!.options.find((o) => o.name === 'Large')!.id;
    ctx.lemonade = (await prisma.menuItem.create({ data: { restaurantId: r.id, categoryId: drinks.id, name: 'Iced Lemonade', priceCents: 45_000 } })).id;
    ctx.offItem = (await prisma.menuItem.create({ data: { restaurantId: r.id, categoryId: mains.id, name: 'Sold Out Curry', priceCents: 99_000, isAvailable: false } })).id;
    await prisma.menuItem.create({ data: { restaurantId: r.id, categoryId: mains.id, name: 'Deleted Dish', priceCents: 1, deletedAt: new Date() } });
  });
  afterAll(() => app.close());

  it('serves the public menu without deleted items', async () => {
    const res = await api(app).get(`/restaurants/${ctx.slug}/menu`);
    expect(res.status).toBe(200);
    const menu = res.body as MenuView;
    const names = menu.categories.flatMap((c) => c.items.map((i) => i.name));
    expect(names).toEqual(expect.arrayContaining(['Margherita Pizza', 'Iced Lemonade', 'Sold Out Curry']));
    expect(names).not.toContain('Deleted Dish');
    expect(menu.categories[0]!.items[0]!.optionGroups[0]!.options).toHaveLength(2);
  });

  let orderId = '';
  it('prices orders on the server, requires a table session and is idempotent', async () => {
    const body = { idempotencyKey: 'order-key-0001', items: [{ menuItemId: ctx.pizza, quantity: 1, optionIds: [ctx.large] }, { menuItemId: ctx.lemonade, quantity: 2 }] };
    expect((await api(app, ctx.customer.token).post('/orders', body)).body.code).toBe('VISIT_REQUIRED');
    await api(app, ctx.customer.token).post('/visits', { qr: ctx.qr, guestCount: 4 });

    const res = await api(app, ctx.customer.token).post('/orders', body);
    expect(res.status).toBe(201);
    const order = res.body as OrderView;
    expect(order).toMatchObject({ status: 'PENDING', table: { label: 'T12' }, guestCount: 4, subtotalCents: 245_000 + 90_000, totalCents: 335_000 });
    expect(order.items.find((i) => i.name === 'Margherita Pizza')).toMatchObject({ unitPriceCents: 245_000, options: ['Large'] });
    orderId = order.id;
    expect((await api(app, ctx.customer.token).post('/orders', body)).body.id).toBe(orderId);
    expect(await prisma.order.count({ where: { customerId: ctx.customer.id } })).toBe(1);
  });

  it('rejects unavailable items, missing required options and foreign items', async () => {
    const post = (items: object[]) => api(app, ctx.customer.token).post('/orders', { idempotencyKey: `k-${Math.random()}`, items });
    expect((await post([{ menuItemId: ctx.offItem, quantity: 1 }])).status).toBe(409);
    expect((await post([{ menuItemId: ctx.pizza, quantity: 1 }])).status).toBe(400);
    expect((await post([{ menuItemId: ctx.pizza, quantity: 1, optionIds: [ctx.regular, ctx.large] }])).status).toBe(400);
    const foreign = await prisma.menuItem.findFirst({ where: { restaurantId: { not: ctx.rid } } });
    if (foreign) expect((await post([{ menuItemId: foreign.id, quantity: 1 }])).status).toBe(404);
  });

  it('moves through the order lifecycle only in order, and only for staff of that restaurant', async () => {
    const step = (status: string) => api(app, ctx.waiter.token).post(`/restaurants/${ctx.rid}/orders/${orderId}/status`, { status });
    expect((await api(app, ctx.outsider.token).post(`/restaurants/${ctx.rid}/orders/${orderId}/status`, { status: 'ACCEPTED' })).status).toBe(403);
    expect((await step('READY')).body.code).toBe('INVALID_TRANSITION');
    for (const s of ['ACCEPTED', 'PREPARING', 'READY', 'DELIVERED']) expect((await step(s)).body.status).toBe(s);
    const o = (await api(app, ctx.customer.token).get(`/orders/${orderId}`)).body as OrderView;
    expect(o.acceptedAt && o.preparingAt && o.readyAt && o.deliveredAt).toBeTruthy();
    expect((await api(app, ctx.waiter.token).get(`/restaurants/${ctx.rid}/orders?view=done`)).body.items[0].id).toBe(orderId);
    const notes = await prisma.notification.findMany({ where: { userId: ctx.customer.id, type: { startsWith: 'order.' } } });
    expect(notes).toHaveLength(4);
  });

  it('lets customers cancel only while pending', async () => {
    const o = (await api(app, ctx.customer.token).post('/orders', { idempotencyKey: 'order-key-0002', items: [{ menuItemId: ctx.lemonade, quantity: 1 }] })).body as OrderView;
    expect((await api(app, ctx.customer.token).post(`/orders/${o.id}/cancel`)).body.status).toBe('CANCELLED');
    expect((await api(app, ctx.customer.token).post(`/orders/${orderId}/cancel`)).status).toBe(409);
    expect((await api(app, ctx.outsider.token).get(`/orders/${o.id}`)).status).toBe(404);
  });

  it('uploads images as resized WebP and enforces purpose permissions', async () => {
    const png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#2f74ff' } }).png().toBuffer();
    const up = (token: string, fields: Record<string, string>, file: Buffer, name = 'a.png') => {
      let r = request(app.getHttpServer()).post('/api/v1/uploads').set('Authorization', `Bearer ${token}`);
      for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
      return r.attach('file', file, name);
    };
    const avatar = await up(ctx.customer.token, { purpose: 'AVATAR' }, png);
    expect(avatar.status).toBe(201);
    expect(avatar.body).toMatchObject({ width: 512, height: 256 });
    const served = await request(app.getHttpServer()).get(avatar.body.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');

    expect((await up(ctx.waiter.token, { purpose: 'MENU_ITEM', restaurantId: ctx.rid }, png)).status).toBe(403);
    expect((await up(ctx.customer.token, { purpose: 'AVATAR' }, Buffer.from('not an image'), 'x.png')).status).toBe(400);
    expect((await request(app.getHttpServer()).get('/api/v1/uploads/files/..%2F..%2Fpackage.json')).status).toBe(404);
  });
});
