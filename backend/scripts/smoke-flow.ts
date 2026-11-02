/**
 * End-to-end smoke test against the RUNNING dev stack (API + local Supabase + seed):
 * customer scans T1 → requests a waiter → waiter is alerted in realtime → accepts →
 * they chat → waiter completes. Exercises the exact endpoints/events the apps use.
 * Usage: pnpm dev:smoke   (requires `pnpm dev:supabase`, `pnpm dev:backend`, `pnpm db:seed`)
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { io, type Socket } from 'socket.io-client';
import { createApiClient } from '@servebell/api-client';
import { RealtimeCommand, RealtimeEvent, type RealtimeEnvelope, type ServiceRequestView } from '@servebell/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { passwordSignIn } from './supabase-auth.js';

const API = process.env.SMOKE_API_URL ?? 'http://127.0.0.1:4000';
const PASSWORD = 'ServeBell#2026';

const signIn = (email: string) => passwordSignIn(email, PASSWORD);

const client = (token: string) => createApiClient({ baseUrl: API, getIdToken: async () => token });
const step = (n: number, msg: string) => console.log(`  ${String(n).padStart(2)}. ${msg}`);
function nextEvent<T>(socket: Socket, event: string, match: (d: T) => boolean, ms = 5000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    socket.on(event, (e: RealtimeEnvelope<T>) => {
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

const waiterSocket = io(API, { auth: { token: waiterToken }, transports: ['websocket'] });
const customerSocket = io(API, { auth: { token: customerToken }, transports: ['websocket'] });
await Promise.all([waiterSocket, customerSocket].map((s) => new Promise<void>((r, j) => { s.on('connect', () => r()); s.on('connect_error', j); })));
const joined = await waiterSocket.emitWithAck(RealtimeCommand.JOIN_RESTAURANT, { id: restaurantId });
if (!joined.ok) throw new Error(`Waiter could not join staff room: ${joined.error}`);
step(2, 'Both connected to realtime; waiter joined the staff room');

const visit = await customer.visits.start(`http://localhost:3000/t/${qr.token}`);
step(3, `Customer scanned QR → seated at ${visit.restaurant.name}, table ${visit.table.label}`);

const waiterType = visit.services.find((s) => s.isPrimary)!;
const alerted = nextEvent<ServiceRequestView>(waiterSocket, RealtimeEvent.SERVICE_CREATED, (d) => d.table.label === visit.table.label);
const t0 = Date.now();
const created = await customer.services.create({ serviceTypeId: waiterType.id, quantity: 1, idempotencyKey: randomUUID(), note: 'Smoke test — please ignore' });
const alert = await alerted;
step(4, `Customer tapped "${waiterType.name}" → waiter alerted in ${Date.now() - t0} ms (request #${alert.number}${created.duplicate ? ', reused open request' : ''})`);

const accepted = nextEvent<ServiceRequestView>(customerSocket, RealtimeEvent.SERVICE_ACCEPTED, (d) => d.id === created.id);
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

waiterSocket.close();
customerSocket.close();
console.log('\n✔ Smoke flow passed\n');
