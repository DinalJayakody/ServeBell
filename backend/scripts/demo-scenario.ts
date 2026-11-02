/**
 * Runs a full, realistic scenario against a running ServeBell API and LEAVES the data in place
 * so people can keep testing with it:
 *   owner applies → platform admin approves → profile, hours, menu → floor plan with landmarks
 *   (restaurant A) or a simple table list without a plan (restaurant B) → go live → invite waiter
 *   → customer reserves (specific table + any table) → staff confirm / assign → customer scans a
 *   table QR → service requests in every state → chat → order.
 *
 *   API_URL=https://<host> SUPABASE_URL=... SUPABASE_SECRET_KEY=... DEMO_PASSWORD=... \
 *   [ADMIN_GRANT_CMD='… make-admin … {email}' ADMIN_REVOKE_CMD='… revoke-admin … {email}'  (local only;
 *    without them the script waits until a platform admin approves the two applications in the app)] \
 *   pnpm --filter @servebell/backend exec tsx scripts/demo-scenario.ts dinaljayakody25@gmail.com
 *
 * Accounts are plus-addresses of the given Gmail, created already verified with DEMO_PASSWORD.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ensureAuthUser, passwordSignIn } from './supabase-auth.js';

const base = process.argv[2]?.trim().toLowerCase();
const API = `${process.env.API_URL!.replace(/\/$/, '')}/api/v1`;
const PASSWORD = process.env.DEMO_PASSWORD!;
if (!base?.includes('@') || !process.env.API_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY || !PASSWORD) {
  console.error('Usage: API_URL=… SUPABASE_URL=… SUPABASE_SECRET_KEY=… DEMO_PASSWORD=… tsx scripts/demo-scenario.ts you@gmail.com');
  process.exit(1);
}
const [local, domain] = base.split('@') as [string, string];
const alias = (tag: string) => `${local}+${tag}@${domain}`;


type U = { email: string; name: string; token: string; id: string };
const log = (m: string) => console.log(`• ${m}`);

const idToken = (email: string) => passwordSignIn(email, PASSWORD);

async function call<T = any>(u: U | null, method: string, path: string, body?: unknown, ok = [200, 201, 204], retried = false): Promise<T> {
  const res = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', ...(u ? { authorization: `Bearer ${u.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && u && !retried) {
    // Access tokens last an hour; sign in again and retry once.
    u.token = await idToken(u.email);
    return call<T>(u, method, path, body, ok, true);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!ok.includes(res.status)) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return json as T;
}

async function account(tag: string, name: string, app: 'CUSTOMER' | 'RESTAURANT'): Promise<U> {
  const email = alias(tag);
  await ensureAuthUser({ email, password: PASSWORD, fullName: name });
  const u = { email, name, token: await idToken(email), id: '' };
  u.id = (await call<{ id: string }>(u, 'POST', '/auth/sync', { app, fullName: name })).id;
  log(`account ${email}`);
  return u;
}

const shell = (tpl: string | undefined, email: string) => {
  if (!tpl) throw new Error('ADMIN_GRANT_CMD / ADMIN_REVOKE_CMD not set');
  execSync(tpl.replaceAll('{email}', email), { stdio: 'inherit' });
};

/** Applies, gets approved, and returns the new restaurant id (reuses an earlier approval). */
type Application = { id: string; status: string; restaurantId: string | null };
const mineApps = (owner: U) => call<Application[]>(owner, 'GET', '/onboarding/owner-applications/mine');

/** Applies (once). Returns the application, approved or still pending. */
async function apply(owner: U, info: { restaurantName: string; addressLine: string; city: string; phone: string }) {
  const mine = await mineApps(owner);
  return mine.find((a) => a.status === 'APPROVED' && a.restaurantId) ?? mine.find((a) => a.status === 'PENDING') ?? (await call<Application>(owner, 'POST', '/onboarding/owner-applications', { ...info, note: 'Demo restaurant created by the scenario script' }));
}

/** With a reviewer account, approves directly; otherwise waits for a real platform admin to approve in the app. */
async function approved(owner: U, app: Application, name: string, reviewer: U | null) {
  if (app.status === 'APPROVED') return app.restaurantId!;
  if (reviewer) return (await call<{ restaurantId: string }>(reviewer, 'POST', `/onboarding/owner-applications/${app.id}/review`, { decision: 'APPROVED', reviewNote: 'Welcome to ServeBell!' })).restaurantId;
  log(`waiting for a platform admin to approve "${name}" (Restaurant app → Settings → Review owner applications)…`);
  for (;;) {
    // Tolerate brief network/server hiccups while waiting (this can take hours).
    const cur = (await mineApps(owner).catch(() => [] as Application[])).find((a) => a.id === app.id);
    if (cur?.status === 'APPROVED' && cur.restaurantId) { log(`approved ${name}`); return cur.restaurantId; }
    if (cur?.status === 'REJECTED') throw new Error(`${name} was rejected`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

async function setUp(owner: U, rid: string, profile: { description: string; categories: { name: string; kind: 'FOOD' | 'DRINK'; items: [string, number, string][] }[] }) {
  const M = `/restaurants/${rid}/manage`;
  await call(owner, 'PATCH', M, { description: profile.description });
  await call(owner, 'PUT', `${M}/hours`, { hours: [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [{ dayOfWeek: d, opensMinute: 11 * 60, closesMinute: 15 * 60 }, { dayOfWeek: d, opensMinute: 17 * 60 + 30, closesMinute: 23 * 60 }]) });
  const existing = await call<{ id: string; name: string }[]>(owner, 'GET', `${M}/menu/categories`);
  for (const c of profile.categories) {
    if (existing.some((e) => e.name === c.name)) continue;
    const cat = await call<{ id: string }>(owner, 'POST', `${M}/menu/categories`, { name: c.name, kind: c.kind });
    for (const [name, price, description] of c.items) await call(owner, 'POST', `${M}/menu/items`, { categoryId: cat.id, name, priceCents: price * 100, description });
  }
  log('profile, opening hours and menu ready');
}

const tomorrowAt = async (path: string, hour: number, dayOffset = 1) => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(Date.now() + dayOffset * 86_400_000));
  const slots = await call<{ startsAt: string; available: boolean }[]>(null, 'GET', `${path}?date=${date}&partySize=${path.includes('/tables/') ? 2 : 4}`);
  const want = slots.filter((s) => s.available).find((s) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(s.startsAt))) >= hour);
  if (!want) throw new Error(`no slot for ${path} on ${date}`);
  return want.startsAt;
};

// ───────────────────────────────── scenario ─────────────────────────────────
const owner = await account('owner', 'Nimal Perera (Demo owner)', 'RESTAURANT');
const owner2 = await account('owner2', 'Shanika Silva (Demo owner 2)', 'RESTAURANT');
const waiter = await account('waiter', 'Kasun Fernando (Demo waiter)', 'RESTAURANT');
const guest = await account('guest', 'Amaya Jayasinghe (Demo guest)', 'CUSTOMER');
// Local runs can use a temporary reviewer (ADMIN_GRANT_CMD/ADMIN_REVOKE_CMD); on a live server a real admin approves.
const reviewer = process.env.ADMIN_GRANT_CMD ? await account('reviewer', 'ServeBell Reviewer (Demo)', 'RESTAURANT') : null;
if (reviewer) shell(process.env.ADMIN_GRANT_CMD, reviewer.email);
const appA = await apply(owner, { restaurantName: 'Ocean Breeze Café (Demo)', addressLine: '12 Marine Drive, Kollupitiya', city: 'Colombo', phone: '0771234567' });
const appB = await apply(owner2, { restaurantName: 'Spice Corner (Demo)', addressLine: '45 Peradeniya Road', city: 'Kandy', phone: '0812345678' });
const [ridA, ridB] = await Promise.all([approved(owner, appA, 'Ocean Breeze Café (Demo)', reviewer), approved(owner2, appB, 'Spice Corner (Demo)', reviewer)]);
if (reviewer) {
  shell(process.env.ADMIN_REVOKE_CMD, reviewer.email);
  log('temporary reviewer no longer an administrator');
}

await setUp(owner, ridA, {
  description: 'Seaside café with a cocktail bar. Demo restaurant with a full floor plan.',
  categories: [
    { name: 'Mains', kind: 'FOOD', items: [['Seafood Kottu', 1850, 'Chopped roti with prawns and cuttlefish'], ['Chicken Biryani', 1650, 'Fragrant basmati, cashews, raita'], ['Grilled Fish & Chips', 2200, 'Catch of the day, tartare sauce']] },
    { name: 'Drinks', kind: 'DRINK', items: [['King Coconut', 450, 'Fresh thambili'], ['Iced Ceylon Tea', 550, 'With lime and mint'], ['Mango Lassi', 750, 'Alphonso mango, yoghurt']] },
  ],
});
await setUp(owner2, ridB, {
  description: 'Family curry house. Demo restaurant WITHOUT a floor plan — tables are just a list.',
  categories: [{ name: 'Rice & Curry', kind: 'FOOD', items: [['Rice & Curry (Veg)', 950, 'Five curries, papadam'], ['Lamprais', 1750, 'Dutch Burgher classic baked in banana leaf']] }],
});

// Restaurant A: floor plan with landmarks (12 × 9 m).
const MA = `/restaurants/${ridA}/manage`;
let [plan] = await call<any[]>(owner, 'GET', `${MA}/floor-plans`);
if (!plan) plan = await call(owner, 'POST', `${MA}/floor-plans`, { name: 'Main dining', widthCm: 1200, depthCm: 900 });
if (!plan.tables.length) {
  const tbl = (label: string, shape: string, capacity: number, x: number, y: number, width: number, depth: number, zone: string | null = null) => ({ label, shape, capacity, x, y, width, depth, zone });
  plan = await call(owner, 'PUT', `${MA}/floor-plans/${plan.id}`, {
    expectedVersion: plan.version, name: 'Main dining', widthCm: 1200, depthCm: 900,
    tables: [
      tbl('T1', 'ROUND', 2, 80, 120, 70, 70, 'Window side'), tbl('T2', 'ROUND', 2, 80, 300, 70, 70, 'Window side'), tbl('T3', 'ROUND', 2, 80, 480, 70, 70, 'Window side'), tbl('T4', 'ROUND', 2, 80, 660, 70, 70, 'Window side'),
      tbl('T5', 'SQUARE', 4, 320, 300, 90, 90), tbl('T6', 'SQUARE', 4, 520, 300, 90, 90), tbl('T7', 'SQUARE', 4, 320, 500, 90, 90), tbl('T8', 'SQUARE', 4, 520, 500, 90, 90),
      tbl('T9', 'RECTANGLE', 6, 720, 300, 180, 90), tbl('T10', 'RECTANGLE', 6, 720, 500, 180, 90), tbl('T11', 'RECTANGLE', 8, 330, 700, 240, 100, 'Family area'),
    ],
    objects: [
      { kind: 'KITCHEN', x: 300, y: 0, width: 380, depth: 200 },
      { kind: 'RESTROOM', x: 720, y: 0, width: 200, depth: 150 },
      { kind: 'BAR', x: 1100, y: 250, width: 80, depth: 400, label: 'Cocktail bar' },
      { kind: 'WINDOW', x: 0, y: 100, width: 15, depth: 300 },
      { kind: 'WINDOW', x: 0, y: 500, width: 15, depth: 300 },
      { kind: 'ENTRANCE', x: 900, y: 880, width: 180, depth: 20, label: 'Main entrance' },
      { kind: 'PLANT', x: 650, y: 780, width: 60, depth: 60 },
      { kind: 'PLANT', x: 1110, y: 760, width: 60, depth: 60 },
    ],
  });
  await call(owner, 'POST', `${MA}/floor-plans/${plan.id}/publish`, { publish: true });
  log(`floor plan saved and published: ${plan.tables.length} tables`);
}
const tablesA = await call<{ id: string; label: string }[]>(owner, 'GET', `${MA}/tables`);
if (!tablesA.some((t) => t.label === 'Patio 1')) await call(owner, 'POST', `${MA}/tables`, { label: 'Patio 1', capacity: 4, zone: 'Patio' });

// Restaurant B: just a table list — no floor plan at all.
const MB = `/restaurants/${ridB}/manage`;
const tablesB = await call<{ label: string }[]>(owner2, 'GET', `${MB}/tables`);
for (const [label, capacity] of [['Table 1', 2], ['Table 2', 4], ['Table 3', 4], ['Family 1', 8]] as const) if (!tablesB.some((t) => t.label === label)) await call(owner2, 'POST', `${MB}/tables`, { label, capacity });
log('restaurant B: 4 tables, no floor plan');

for (const [o, rid] of [[owner, ridA], [owner2, ridB]] as const) await call(o, 'POST', `/restaurants/${rid}/manage/status`, { status: 'ACTIVE' });
log('both restaurants are live');

// Team: invite and join a waiter at restaurant A.
const members = await call<{ email?: string; user?: { email: string } }[]>(owner, 'GET', `/restaurants/${ridA}/employees`).catch(() => []);
if (!JSON.stringify(members).includes(waiter.email)) {
  const inv = await call<{ code: string }>(owner, 'POST', `/restaurants/${ridA}/invitations`, { email: waiter.email, role: 'WAITER' });
  await call(waiter, 'POST', '/invitations/redeem', { invitationCode: inv.code });
  log(`waiter joined with invitation code ${inv.code}`);
}

// Reservations.
const t5 = (await call<any[]>(null, 'GET', `/restaurants/${ridA}/floor-plans`))[0].tables.find((t: { label: string }) => t.label === 'T5');
const r1 = await call(guest, 'POST', '/reservations', { tableId: t5.id, startsAt: await tomorrowAt(`/tables/${t5.id}/availability`, 19), partySize: 2, note: 'Anniversary dinner' });
await call(owner, 'POST', `/restaurants/${ridA}/reservations/${r1.id}/status`, { status: 'CONFIRMED' });
const t9 = (await call<any[]>(null, 'GET', `/restaurants/${ridA}/floor-plans`))[0].tables.find((t: { label: string }) => t.label === 'T9');
await call(guest, 'POST', '/reservations', { tableId: t9.id, startsAt: await tomorrowAt(`/tables/${t9.id}/availability`, 20, 2), partySize: 2, note: 'Left pending so you can confirm it' });
const slug = (await call<{ slug: string }>(owner2, 'GET', MB)).slug;
const r3 = await call(guest, 'POST', '/reservations', { restaurantId: ridB, startsAt: await tomorrowAt(`/restaurants/${slug}/availability`, 12), partySize: 4, note: 'Any table is fine' });
const fam = (await call<{ id: string; label: string }[]>(owner2, 'GET', `${MB}/tables`)).find((t) => t.label === 'Table 2')!;
await call(owner2, 'POST', `/restaurants/${ridB}/reservations/${r3.id}/status`, { status: 'CONFIRMED', tableId: fam.id });
await call(guest, 'POST', '/reservations', { restaurantId: ridB, startsAt: await tomorrowAt(`/restaurants/${slug}/availability`, 19, 3), partySize: 4, note: 'Pending any-table request: pick a table when confirming' });
log('reservations: confirmed T5, pending T9, any-table confirmed at Spice Corner (Table 2), one any-table pending');

// At the table: scan T2's QR, request services, chat and order.
const qr = (await call<{ tableLabel: string; url: string }[]>(owner, 'GET', `${MA}/qr-codes`)).find((q) => q.tableLabel === 'T2')!;
const { visit } = await call<{ visit: { id: string } | null }>(guest, 'GET', '/visits/active');
if (!visit) await call(guest, 'POST', '/visits', { qr: qr.url, guestCount: 2 });
const detail = await call<{ services: { id: string; name: string; isPrimary: boolean }[] }>(guest, 'GET', `/restaurants/${ridA}`);
const svc = (pred: (s: { name: string; isPrimary: boolean }) => boolean) => detail.services.find(pred) ?? detail.services[0]!;
const req = (s: { id: string }, note?: string) => call<{ id: string }>(guest, 'POST', '/services', { serviceTypeId: s.id, note, idempotencyKey: randomUUID() });
const S = `/restaurants/${ridA}/services`;
const done = await req(svc((s) => s.isPrimary), 'Could we see the dessert menu?');
await call(waiter, 'POST', `${S}/${done.id}/accept`);
await call(guest, 'POST', `/services/${done.id}/messages`, { body: 'Thank you! Also a high chair please.', clientMessageId: randomUUID() });
await call(waiter, 'POST', `/services/${done.id}/messages`, { body: 'Coming right up 🙂', clientMessageId: randomUUID() });
await call(waiter, 'POST', `${S}/${done.id}/start`);
await call(waiter, 'POST', `${S}/${done.id}/complete`);
const inProgress = await req(svc((s) => /water/i.test(s.name)), 'Two glasses, no ice');
await call(waiter, 'POST', `${S}/${inProgress.id}/accept`);
await req(svc((s) => /bill/i.test(s.name)));
log('service requests: one completed (with chat), one accepted, one pending');

const menu = await call<{ categories: { items: { id: string; name: string }[] }[] }>(null, 'GET', `/restaurants/${ridA}/menu`);
const items = menu.categories.flatMap((c) => c.items);
const order = await call<{ id: string }>(guest, 'POST', '/orders', { items: [{ menuItemId: items[0]!.id, quantity: 1 }, { menuItemId: items.find((i) => /coconut/i.test(i.name))!.id, quantity: 2 }], note: 'Mild spice please', idempotencyKey: randomUUID() });
await call(owner, 'POST', `/restaurants/${ridA}/orders/${order.id}/status`, { status: 'ACCEPTED' });
await call(owner, 'POST', `/restaurants/${ridA}/orders/${order.id}/status`, { status: 'PREPARING' });
log('order placed and being prepared');

console.log('\n✔ Scenario complete. Accounts (password from DEMO_PASSWORD):');
for (const u of [owner, owner2, waiter, guest]) console.log(`  ${u.email.padEnd(40)} ${u.name}`);
