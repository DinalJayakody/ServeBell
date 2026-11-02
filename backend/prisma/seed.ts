/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Never runs in production. Demo Firebase accounts are only created when
 * SEED_DEMO_ACCOUNTS=true and Firebase admin access (service account or Auth emulator) is configured.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient, type RestaurantRole } from '../src/generated/prisma/client.js';
import { readFile } from 'node:fs/promises';
import { DEFAULT_SERVICE_TYPES } from '../src/onboarding/default-services.js';
import { createStorage } from '../src/uploads/storage.js';
import { processImage } from '../src/uploads/image-processing.js';
import type { FilePurpose } from '@servebell/shared';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a production database.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEMO_PASSWORD = 'ServeBell#2026';
const DEMO_USERS: { email: string; fullName: string; phone: string; platformRole?: 'PLATFORM_ADMIN'; role?: RestaurantRole }[] = [
  { email: 'admin@servebell.dev', fullName: 'Platform Admin', phone: '+94770000001', platformRole: 'PLATFORM_ADMIN' },
  { email: 'owner@servebell.dev', fullName: 'Nimal Fernando', phone: '+94770000002', role: 'OWNER' },
  { email: 'manager@servebell.dev', fullName: 'Ayesha Silva', phone: '+94770000003', role: 'ADMIN' },
  { email: 'waiter@servebell.dev', fullName: 'Daniel Perera', phone: '+94770000004', role: 'WAITER' },
  { email: 'waiter2@servebell.dev', fullName: 'Kasun Jayasuriya', phone: '+94770000005', role: 'WAITER' },
  { email: 'customer@servebell.dev', fullName: 'Sarah Johnson', phone: '+94770000006' },
];

const CATEGORIES = [
  ['fine-dining', 'Fine Dining'], ['sri-lankan', 'Sri Lankan'], ['seafood', 'Seafood'], ['cafe', 'Café'],
  ['italian', 'Italian'], ['asian', 'Asian'], ['fast-food', 'Fast Food'], ['desserts', 'Desserts'],
] as const;

type SeedItem = { name: string; description: string; lkr: number; image?: string; tags?: string[]; prep?: number };
const MENU: { category: string; kind: 'FOOD' | 'DRINK'; items: SeedItem[] }[] = [
  { category: 'Starters', kind: 'FOOD', items: [
    { name: 'Caesar Salad', description: 'Fresh romaine, parmesan, croutons', lkr: 1250, image: 'caesar', prep: 10 },
    { name: 'Salmon Nigiri', description: 'Fresh salmon over seasoned rice', lkr: 1650, image: 'tempura', prep: 10 },
  ] },
  { category: 'Main Course', kind: 'FOOD', items: [
    { name: 'Margherita Pizza', description: 'Fresh tomatoes, mozzarella, basil', lkr: 1850, image: 'pizza', prep: 18 },
    { name: 'Grilled Salmon', description: 'With seasonal vegetables', lkr: 2450, image: 'salmon', tags: ['special'], prep: 20 },
    { name: 'Chicken Burger', description: 'Grilled chicken, lettuce, tomato', lkr: 1550, image: 'burger', prep: 15 },
    { name: 'Seafood Fried Rice', description: 'Wok-fried rice with prawns and cuttlefish', lkr: 1950, image: 'friedrice', prep: 15 },
    { name: 'BBQ Pork Ribs', description: 'Slow-cooked ribs, smoky glaze, fries', lkr: 2850, image: 'special', prep: 25 },
  ] },
  { category: 'Desserts', kind: 'FOOD', items: [
    { name: 'Chocolate Lava Cake', description: 'Warm chocolate with vanilla ice cream', lkr: 1200, image: 'lava', prep: 12 },
    { name: 'Strawberry Panna Cotta', description: 'Vanilla cream, fresh strawberries', lkr: 950, image: 'watalappan', prep: 5 },
  ] },
  { category: 'Drinks', kind: 'DRINK', items: [
    { name: 'Iced Lemonade', description: 'Fresh lime, mint and soda', lkr: 450, image: 'lemonade' },
    { name: 'Ceylon Iced Tea', description: 'Brewed black tea with lemon', lkr: 500, image: 'icedtea' },
    { name: 'King Coconut', description: 'Chilled thambili', lkr: 400 },
  ] },
];
const RETIRED_ITEMS = ['Prawn Tempura', 'Watalappan'];
const COVERS: Record<string, string> = {
  'ocean-breeze-colombo': 'interior',
  'hill-country-kitchen-kandy': 'friedrice',
  'fort-trattoria-galle': 'pizza',
  'lotus-wok-colombo': 'interior3',
};

const storage = createStorage();
const imageCache = new Map<string, string>();
/** Stores a seed asset once (resized like real uploads) and returns its file id. */
async function seedImage(name: string, purpose: FilePurpose, restaurantId: string) {
  const cacheKey = `${restaurantId}:${name}:${purpose}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)!;
  const img = await processImage(await readFile(new URL(`./seed-assets/${name}.jpg`, import.meta.url)), purpose);
  await storage.put(img.key, img.data, img.mimeType);
  const file = await prisma.fileObject.create({
    data: { restaurantId, purpose, storageKey: img.key, mimeType: img.mimeType, sizeBytes: img.data.length, width: img.width, height: img.height, status: 'READY' },
  });
  imageCache.set(cacheKey, file.id);
  return file.id;
}

/** Idempotent menu sync: creates missing categories/items, attaches photos, retires old demo items. */
async function syncMenu(restaurantId: string) {
  await prisma.menuItem.updateMany({ where: { restaurantId, name: { in: RETIRED_ITEMS }, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
  for (const [ci, cat] of MENU.entries()) {
    const category =
      (await prisma.menuCategory.findFirst({ where: { restaurantId, name: cat.category, deletedAt: null } })) ??
      (await prisma.menuCategory.create({ data: { restaurantId, name: cat.category, kind: cat.kind, sortOrder: ci } }));
    for (const [ii, it] of cat.items.entries()) {
      const existing = await prisma.menuItem.findFirst({ where: { restaurantId, name: it.name, deletedAt: null }, include: { images: true } });
      const item = existing
        ? await prisma.menuItem.update({ where: { id: existing.id }, data: { tags: it.tags ?? [], prepMinutes: it.prep ?? null, sortOrder: ii }, include: { images: true } })
        : await prisma.menuItem.create({ data: { restaurantId, categoryId: category.id, name: it.name, description: it.description, priceCents: it.lkr * 100, tags: it.tags ?? [], prepMinutes: it.prep ?? null, sortOrder: ii }, include: { images: true } });
      if (it.image && item.images.length === 0) {
        await prisma.menuItemImage.create({ data: { itemId: item.id, fileId: await seedImage(it.image, 'MENU_ITEM', restaurantId) } });
      }
    }
  }
  if (!(await prisma.menuOptionGroup.findFirst({ where: { item: { restaurantId, name: 'Margherita Pizza' } } }))) {
    const pizza = await prisma.menuItem.findFirstOrThrow({ where: { restaurantId, name: 'Margherita Pizza', deletedAt: null } });
    await prisma.menuOptionGroup.create({
      data: { itemId: pizza.id, name: 'Size', minSelect: 1, maxSelect: 1, options: { create: [{ name: 'Regular', sortOrder: 0 }, { name: 'Large', priceDeltaCents: 60000, sortOrder: 1 }] } },
    });
  }
}

/** Table layout in cm for a 14 m × 10 m dining room. */
const TABLES = [
  { label: 'T1', shape: 'ROUND', capacity: 2, x: 120, y: 120, width: 80, depth: 80, zone: 'Window side' },
  { label: 'T2', shape: 'ROUND', capacity: 2, x: 320, y: 120, width: 80, depth: 80, zone: 'Window side' },
  { label: 'T3', shape: 'SQUARE', capacity: 4, x: 520, y: 110, width: 100, depth: 100, zone: 'Window side' },
  { label: 'T4', shape: 'SQUARE', capacity: 4, x: 120, y: 380, width: 100, depth: 100, zone: 'Centre' },
  { label: 'T5', shape: 'SQUARE', capacity: 4, x: 360, y: 380, width: 100, depth: 100, zone: 'Centre' },
  { label: 'T6', shape: 'RECTANGLE', capacity: 6, x: 600, y: 380, width: 200, depth: 100, zone: 'Centre' },
  { label: 'T7', shape: 'RECTANGLE', capacity: 8, x: 120, y: 660, width: 260, depth: 110, zone: 'Family area' },
  { label: 'T8', shape: 'ROUND', capacity: 4, x: 480, y: 660, width: 120, depth: 120, zone: 'Family area' },
  { label: 'T9', shape: 'SQUARE', capacity: 4, x: 700, y: 660, width: 100, depth: 100, zone: 'Family area' },
  { label: 'T10', shape: 'RECTANGLE', capacity: 10, x: 1020, y: 640, width: 300, depth: 120, zone: 'Private corner', rotation: 0 },
  { label: 'T11', shape: 'ROUND', capacity: 2, x: 1100, y: 380, width: 80, depth: 80, zone: 'Bar side' },
  { label: 'T12', shape: 'SQUARE', capacity: 4, x: 900, y: 380, width: 100, depth: 100, zone: 'Bar side' },
] as const;

const OBJECTS = [
  { kind: 'WALL', x: 0, y: 0, width: 1400, depth: 15 },
  { kind: 'WALL', x: 0, y: 985, width: 1400, depth: 15 },
  { kind: 'WALL', x: 0, y: 0, width: 15, depth: 1000 },
  { kind: 'WALL', x: 1385, y: 0, width: 15, depth: 1000 },
  { kind: 'WINDOW', x: 80, y: 0, width: 600, depth: 15, label: 'Ocean view' },
  { kind: 'ENTRANCE', x: 640, y: 985, width: 140, depth: 15, label: 'Main entrance' },
  { kind: 'BAR', x: 900, y: 80, width: 420, depth: 90, label: 'Bar' },
  { kind: 'KITCHEN', x: 1150, y: 860, width: 235, depth: 125, label: 'Kitchen' },
  { kind: 'RESTROOM', x: 15, y: 880, width: 160, depth: 105, label: 'Washrooms' },
  { kind: 'PILLAR', x: 840, y: 520, width: 40, depth: 40 },
  { kind: 'PLANT', x: 820, y: 900, width: 50, depth: 50 },
] as const;

async function ensureDemoUsers(restaurantId: string) {
  const enabled = process.env.SEED_DEMO_ACCOUNTS === 'true';
  const hasAdmin = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_AUTH_EMULATOR_HOST);
  if (!enabled || !hasAdmin) {
    console.log(`• Demo accounts skipped (${!enabled ? 'SEED_DEMO_ACCOUNTS is not true' : 'no Firebase service account or Auth emulator configured'}).`);
    return;
  }
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const app = initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
    ...(sa ? { credential: cert(JSON.parse(Buffer.from(sa, 'base64').toString('utf8'))) } : {}),
  });
  const auth = getAuth(app);
  for (const u of DEMO_USERS) {
    const fb = await auth.getUserByEmail(u.email).catch(() =>
      auth.createUser({ email: u.email, password: DEMO_PASSWORD, displayName: u.fullName, emailVerified: true }),
    );
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { firebaseUid: fb.uid, platformRole: u.platformRole ?? 'USER' },
      create: {
        firebaseUid: fb.uid, email: u.email, fullName: u.fullName, phone: u.phone, emailVerifiedAt: new Date(),
        platformRole: u.platformRole ?? 'USER', customerProfile: u.role ? undefined : { create: {} },
      },
    });
    if (u.role) {
      const count = await prisma.restaurantMember.count({ where: { restaurantId } });
      await prisma.restaurantMember.upsert({
        where: { restaurantId_userId: { restaurantId, userId: user.id } },
        update: { role: u.role, status: 'ACTIVE' },
        create: { restaurantId, userId: user.id, role: u.role, employeeCode: `EMP-${String(count + 1).padStart(4, '0')}` },
      });
    }
  }
  console.log(`• Demo accounts ready (password: ${DEMO_PASSWORD}): ${DEMO_USERS.map((u) => u.email).join(', ')}`);
}

async function seedRestaurant(opts: { slug: string; name: string; description: string; city: string; district: string; address: string; lat: number; lng: number; categories: string[]; withLayout: boolean }) {
  const existing = await prisma.restaurant.findUnique({ where: { slug: opts.slug } });
  if (existing) return existing;
  const categoryIds = await prisma.category.findMany({ where: { slug: { in: opts.categories } }, select: { id: true } });

  return prisma.$transaction(async (tx) => {
    const r = await tx.restaurant.create({
      data: {
        slug: opts.slug, name: opts.name, description: opts.description, status: 'ACTIVE',
        addressLine: opts.address, city: opts.city, district: opts.district, latitude: opts.lat, longitude: opts.lng,
        phone: '+94112345678', ratingAvg: 4.6, ratingCount: 128,
        categories: { create: categoryIds.map((c) => ({ categoryId: c.id })) },
        openingHours: { create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensMinute: 11 * 60, closesMinute: d >= 5 ? 24 * 60 : 23 * 60 })) },
        amenities: { create: [
          { key: 'wifi', name: 'Free Wi-Fi', icon: 'wifi' }, { key: 'parking', name: 'Parking', icon: 'car' },
          { key: 'ac', name: 'Air conditioning', icon: 'snowflake' }, { key: 'outdoor', name: 'Outdoor seating', icon: 'trees' },
          { key: 'washrooms', name: 'Washrooms', icon: 'bath' }, { key: 'accessible', name: 'Wheelchair accessible', icon: 'accessibility' },
        ] },
        utensils: { create: ['Fork', 'Knife', 'Spoon', 'Glass', 'Plate', 'Tissue', 'Water jug'].map((name, i) => ({ name, sortOrder: i })) },
        serviceTypes: { create: DEFAULT_SERVICE_TYPES.map((s, i) => ({ ...s, sortOrder: i })) },
      },
    });
    if (opts.withLayout) {
      const plan = await tx.floorPlan.create({
        data: { restaurantId: r.id, name: 'Main dining', widthCm: 1400, depthCm: 1000, status: 'PUBLISHED', version: 1, publishedAt: new Date(),
          objects: { create: OBJECTS.map((o) => ({ ...o })) } },
      });
      for (const t of TABLES) {
        const table = await tx.restaurantTable.create({ data: { ...t, restaurantId: r.id, floorPlanId: plan.id, features: [] } });
        await tx.tableQrCode.create({ data: { restaurantId: r.id, tableId: table.id, version: 1, token: randomBytes(16).toString('base64url') } });
      }
    }
    return r;
  });
}

async function main() {
  for (const [i, [slug, name]] of CATEGORIES.entries()) {
    await prisma.category.upsert({ where: { slug }, update: { name, sortOrder: i }, create: { slug, name, sortOrder: i } });
  }
  const flagship = await seedRestaurant({
    slug: 'ocean-breeze-colombo', name: 'Ocean Breeze', city: 'Colombo', district: 'Colombo', address: '42 Galle Road, Colombo 03',
    description: 'Seafood and modern Sri Lankan cuisine with an ocean view.', lat: 6.9022, lng: 79.8507, categories: ['seafood', 'fine-dining', 'sri-lankan'], withLayout: true,
  });
  await seedRestaurant({ slug: 'hill-country-kitchen-kandy', name: 'Hill Country Kitchen', city: 'Kandy', district: 'Kandy', address: '18 Dalada Veediya, Kandy',
    description: 'Traditional rice and curry in the heart of Kandy.', lat: 7.2936, lng: 80.6413, categories: ['sri-lankan'], withLayout: false });
  await seedRestaurant({ slug: 'fort-trattoria-galle', name: 'Fort Trattoria', city: 'Galle', district: 'Galle', address: '7 Church Street, Galle Fort',
    description: 'Wood-fired pizza and pasta inside Galle Fort.', lat: 6.0269, lng: 80.217, categories: ['italian', 'cafe'], withLayout: false });
  await seedRestaurant({ slug: 'lotus-wok-colombo', name: 'Lotus Wok', city: 'Colombo', district: 'Colombo', address: '120 Duplication Road, Colombo 04',
    description: 'Pan-Asian street food classics.', lat: 6.8905, lng: 79.8561, categories: ['asian', 'fast-food'], withLayout: false });

  for (const r of await prisma.restaurant.findMany({ where: { slug: { in: Object.keys(COVERS) } } })) {
    await syncMenu(r.id);
    if (!r.coverFileId) await prisma.restaurant.update({ where: { id: r.id }, data: { coverFileId: await seedImage(COVERS[r.slug]!, 'RESTAURANT_IMAGE', r.id) } });
  }
  console.log('• Menus and photos synced');

  await ensureDemoUsers(flagship.id);
  const qr = await prisma.tableQrCode.findFirst({ where: { restaurantId: flagship.id, status: 'ACTIVE' }, include: { table: true }, orderBy: { createdAt: 'asc' } });
  if (qr) console.log(`• Sample table QR (${qr.table.label}): ${process.env.PUBLIC_WEB_URL}/t/${qr.token}`);
  console.log('✔ Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
