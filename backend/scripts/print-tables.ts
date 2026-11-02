/**
 * Development helper: prints every active table QR of the seeded restaurants,
 * writes a printable page of QR codes, and shows how to open a table on the
 * iOS simulator (which has no camera).  Usage: pnpm dev:tables
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import QRCode from 'qrcode';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address ?? 'localhost';
const web = `http://${lan}:3000`;

const codes = await prisma.tableQrCode.findMany({
  where: { status: 'ACTIVE', restaurant: { status: 'ACTIVE' } },
  include: { table: true, restaurant: true },
  orderBy: [{ restaurant: { name: 'asc' } }, { table: { label: 'asc' } }],
});
if (codes.length === 0) {
  console.log('No table QR codes found. Run `pnpm db:seed` first.');
  process.exit(0);
}

const cards: string[] = [];
for (const c of codes) {
  const url = `${web}/t/${c.token}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 220 });
  cards.push(`<figure>${svg}<figcaption><b>${c.restaurant.name}</b><br>Table ${c.table.label} · ${c.table.capacity} seats</figcaption></figure>`);
}
const dir = resolve(import.meta.dirname, '../../tmp');
mkdirSync(dir, { recursive: true });
const file = join(dir, 'table-qr-codes.html');
writeFileSync(
  file,
  `<!doctype html><meta charset="utf-8"><title>ServeBell table QR codes (dev)</title>
<style>body{font-family:system-ui;margin:24px;background:#f6f8fc}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
figure{margin:0;background:#fff;border-radius:16px;padding:16px;text-align:center;box-shadow:0 4px 14px rgba(26,43,76,.08)}figcaption{margin-top:8px;font-size:14px}</style>
<h1>Table QR codes (development)</h1><p>Scan with the ServeBell Customer app → My Table → Scan table QR.</p><main>${cards.join('')}</main>`,
);

const first = codes[0]!;
console.log(`\nQR sheet: ${file}\n(open it on your Mac and scan from the phone app)\n`);
console.log('Tables:');
for (const c of codes) console.log(`  ${c.restaurant.name.padEnd(22)} ${c.table.label.padEnd(4)} ${web}/t/${c.token}`);
console.log(`\niOS simulator (Customer app on port 8081) — open table ${first.table.label} directly:`);
console.log(`  xcrun simctl openurl booted "exp://127.0.0.1:8081/--/t/${first.token}"`);
console.log('Or in the app: My Table → Scan table QR → paste any link above.\n');
await prisma.$disconnect();
