/**
 * End-to-end smoke test against the RUNNING dev stack (API + local Supabase incl. Realtime + seed):
 * customer scans T1 → requests a waiter → waiter is alerted in realtime → accepts →
 * they chat → waiter completes. Exercises the exact endpoints/events the apps use.
 * Usage: pnpm dev:smoke   (requires `pnpm dev:supabase`, `pnpm dev:backend`, `pnpm db:seed`)
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { createApiClient } from '@servebell/api-client';
import { RealtimeEvent, topics, type RealtimeEnvelope, type ServiceRequestView } from '@servebell/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { passwordSignIn } from './supabase-auth.js';

const API = process.env.SMOKE_API_URL ?? 'http://127.0.0.1:4000';
const PASSWORD = 'ServeBell#2026';

const signIn = (email: string) => passwordSignIn(email, PASSWORD);
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

/** Joins a private topic exactly like the apps do (servebell.can_receive decides access). */
async function join(token: string, topic: string) {
  const sb = createClient(SUPABASE_URL, PUBLISHABLE, { auth: { persistSession: false } });
  await sb.realtime.setAuth(token);
  const channel = sb.channel(topic, { config: { private: true } });
  await new Promise<void>((resolve, reject) =>
    channel.subscribe((status, err) => (status === 'SUBSCRIBED' ? resolve() : status !== 'CLOSED' && reject(new Error(`${topic}: ${status} ${err?.message ?? ''}`)))),
  );
  return { sb, channel };
}

const client = (token: string) => createApiClient({ baseUrl: API, getIdToken: async () => token });
const step = (n: number, msg: string) => console.log(`  ${String(n).padStart(2)}. ${msg}`);
function nextEvent<T>(channel: RealtimeChannel, event: string, match: (d: T) => boolean, ms = 5000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    channel.on('broadcast', { event }, ({ payload }) => {
      const e = payload as RealtimeEnvelope<T>;
      if (match(e.data)) {
        clearTimeout(timer);
        resolve(e.data);
      }
    });
  });
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const qr = await prisma.tableQrCode.findFirst({ where: { status: 'ACTIVE', table: { label: 'T1' }, restaurant: { slug: 'ocean-breeze-colombo' } } });
await prisma.$disconnect();
if (!qr) throw new Error('Seeded table T1 not found. Run `pnpm db:seed`.');

console.log(`\nServeBell smoke flow against ${API}\n`);
const [customerToken, waiterToken] = await Promise.all([signIn('customer@servebell.dev'), signIn('waiter@servebell.dev')]);
const customer = client(customerToken);
const waiter = client(waiterToken);
await customer.auth.sync({ app: 'CUSTOMER' });
const staff = await waiter.auth.sync({ app: 'RESTAURANT' });
const restaurantId = staff.memberships[0]?.restaurantId;
if (!restaurantId) throw new Error('waiter@servebell.dev has no restaurant membership. Re-run `pnpm db:seed`.');
step(1, `Signed in customer + waiter (${staff.memberships[0]!.restaurantName}, ${staff.memberships[0]!.role})`);

const [waiterRt, customerRt] = await Promise.all([join(waiterToken, topics.restaurantStaff(restaurantId)), join(customerToken, topics.user(customer && (await customer.auth.me()).id))]);
const denied = await join(customerToken, topics.restaurantStaff(restaurantId)).then(() => false, () => true);
if (!denied) throw new Error('Customer was allowed into the staff topic');
step(2, 'Waiter subscribed to the staff topic, customer to their own; customer refused the staff topic');

const visit = await customer.visits.start(`http://localhost:3000/t/${qr.token}`);
step(3, `Customer scanned QR → seated at ${visit.restaurant.name}, table ${visit.table.label}`);

const waiterType = visit.services.find((s) => s.isPrimary)!;
const alerted = nextEvent<ServiceRequestView>(waiterRt.channel, RealtimeEvent.SERVICE_CREATED, (d) => d.table.label === visit.table.label);
const t0 = Date.now();
const created = await customer.services.create({ serviceTypeId: waiterType.id, quantity: 1, idempotencyKey: randomUUID(), note: 'Smoke test — please ignore' });
const alert = await alerted;
step(4, `Customer tapped "${waiterType.name}" → waiter alerted in ${Date.now() - t0} ms (request #${alert.number}${created.duplicate ? ', reused open request' : ''})`);

const accepted = nextEvent<ServiceRequestView>(customerRt.channel, RealtimeEvent.SERVICE_ACCEPTED, (d) => d.id === created.id);
await waiter.staffServices.accept(restaurantId, created.id);
const seen = await accepted;
step(5, `Waiter accepted → customer sees "${seen.acceptedBy?.fullName}" in realtime`);

await customer.services.sendMessage(created.id, { body: 'Could we get the dessert menu?', clientMessageId: randomUUID() });
await waiter.services.sendMessage(created.id, { body: 'On my way with it!', clientMessageId: randomUUID() });
const thread = await customer.services.messages(created.id);
step(6, `Chat persisted (${thread.filter((m) => m.senderRole !== 'SYSTEM').length} messages + ${thread.filter((m) => m.senderRole === 'SYSTEM').length} system)`);

await waiter.staffServices.start(restaurantId, created.id);
const done = await waiter.staffServices.complete(restaurantId, created.id);
const detail = await customer.services.detail(created.id);
const ms = (a: string | null, b: string | null) => (a && b ? `${((new Date(b).getTime() - new Date(a).getTime()) / 1000).toFixed(1)}s` : '—');
step(7, `Completed → timeline ${detail.events.map((e) => e.type).join(' → ')}; accept ${ms(done.createdAt, done.acceptedAt)}, complete ${ms(done.createdAt, done.completedAt)}`);

const stats = await waiter.staffServices.stats(restaurantId);
step(8, `Waiter stats today: ${stats.completedToday} completed, pending ${stats.pending}`);

await Promise.all([waiterRt.sb.removeAllChannels(), customerRt.sb.removeAllChannels()]);
console.log('\n✔ Smoke flow passed\n');
process.exit(0);
