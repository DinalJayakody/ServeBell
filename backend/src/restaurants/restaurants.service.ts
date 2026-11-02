import { Injectable } from '@nestjs/common';
import type { RestaurantDetail, RestaurantListQuery, RestaurantSummary, Page, Category } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { isOpenNow, localClock } from './opening-hours.js';
import { fileUrl } from '../common/files.js';

const summaryInclude = {
  cover: { select: { storageKey: true } },
  categories: { include: { category: { select: { slug: true, name: true } } } },
  openingHours: { select: { dayOfWeek: true, opensMinute: true, closesMinute: true } },
} satisfies Prisma.RestaurantInclude;

type SummaryRow = Prisma.RestaurantGetPayload<{ include: typeof summaryInclude }>;

/** Public discovery: only ACTIVE, non-deleted restaurants are ever visible. */
@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

  categories(): Promise<Category[]> {
    return this.prisma.category.findMany({ select: { slug: true, name: true, icon: true }, orderBy: { sortOrder: 'asc' } });
  }

  async list(q: RestaurantListQuery): Promise<Page<RestaurantSummary>> {
    const offset = q.cursor ? Number.parseInt(q.cursor, 10) || 0 : 0;
    const where: Prisma.RestaurantWhereInput = {
      status: 'ACTIVE',
      deletedAt: null,
      ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
      ...(q.category ? { categories: { some: { category: { slug: q.category } } } } : {}),
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { city: { contains: q.q, mode: 'insensitive' } }, { addressLine: { contains: q.q, mode: 'insensitive' } }, { district: { contains: q.q, mode: 'insensitive' } }] }
        : {}),
    };

    let rows: SummaryRow[];
    const distances = new Map<string, number>();
    if (q.lat !== undefined && q.lng !== undefined) {
      // Order by great-circle distance; filtering reuses the Prisma where via an id pre-filter.
      const candidates = await this.prisma.restaurant.findMany({ where, select: { id: true } });
      if (candidates.length === 0) return { items: [], nextCursor: null };
      const ranked = await this.prisma.$queryRaw<{ id: string; km: number | null }[]>`
        SELECT id, CASE WHEN latitude IS NULL OR longitude IS NULL THEN NULL ELSE
          6371 * 2 * asin(sqrt(power(sin(radians(latitude - ${q.lat}) / 2), 2) +
          cos(radians(${q.lat})) * cos(radians(latitude)) * power(sin(radians(longitude - ${q.lng}) / 2), 2))) END AS km
        FROM restaurants WHERE id IN (${Prisma.join(candidates.map((c) => Prisma.sql`${c.id}::uuid`))})
        ORDER BY km ASC NULLS LAST, name ASC
        OFFSET ${offset} LIMIT ${q.limit + 1}`;
      ranked.forEach((r) => r.km !== null && distances.set(r.id, Number(r.km)));
      const byId = new Map((await this.prisma.restaurant.findMany({ where: { id: { in: ranked.map((r) => r.id) } }, include: summaryInclude })).map((r) => [r.id, r]));
      rows = ranked.map((r) => byId.get(r.id)).filter((r): r is SummaryRow => !!r);
    } else {
      rows = await this.prisma.restaurant.findMany({ where, include: summaryInclude, orderBy: [{ ratingAvg: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }], skip: offset, take: q.limit + 1 });
    }

    const hasMore = rows.length > q.limit;
    return {
      items: rows.slice(0, q.limit).map((r) => this.toSummary(r, distances.get(r.id) ?? null)),
      nextCursor: hasMore ? String(offset + q.limit) : null,
    };
  }

  async detail(idOrSlug: string, userId?: string): Promise<RestaurantDetail> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const r = await this.prisma.restaurant.findFirst({
      where: { ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }), status: 'ACTIVE', deletedAt: null },
      include: {
        ...summaryInclude,
        images: { include: { file: { select: { storageKey: true } } }, orderBy: { sortOrder: 'asc' } },
        amenities: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        utensils: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, description: true, icon: true, isAvailable: true } },
        serviceTypes: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, kind: true, name: true, icon: true, isPrimary: true } },
        floorPlans: { where: { status: 'PUBLISHED' }, select: { id: true }, take: 1 },
        _count: { select: { tables: { where: { deletedAt: null, isActive: true, isReservable: true } } } },
        favourites: userId ? { where: { userId }, select: { userId: true } } : false,
      },
    });
    if (!r) throw Errors.notFound('Restaurant');
    return {
      ...this.toSummary(r, null),
      description: r.description,
      phone: r.phone,
      timezone: r.timezone,
      currency: r.currency,
      images: r.images.map((i) => ({ url: fileUrl(i.file.storageKey), caption: i.caption })),
      openingHours: r.openingHours,
      amenities: r.amenities.map((a) => ({ key: a.key, name: a.name, icon: a.icon, description: a.description })),
      utensils: r.utensils,
      services: r.serviceTypes,
      hasFloorPlan: r.floorPlans.length > 0,
      reservableTables: r._count.tables,
      // Any restaurant with opening hours takes "any table" requests; staff assign the table.
      acceptsReservations: r.openingHours.length > 0,
      isFavourite: Array.isArray(r.favourites) && r.favourites.length > 0,
    };
  }

  private toSummary(r: SummaryRow, distanceKm: number | null): RestaurantSummary {
    const { day } = localClock(r.timezone);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      addressLine: r.addressLine,
      city: r.city,
      district: r.district,
      latitude: r.latitude,
      longitude: r.longitude,
      distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
      ratingAvg: r.ratingAvg,
      ratingCount: r.ratingCount,
      coverUrl: r.cover ? fileUrl(r.cover.storageKey) : null,
      categories: r.categories.map((c) => c.category),
      openNow: isOpenNow(r.openingHours, r.timezone),
      todayHours: r.openingHours.filter((h) => h.dayOfWeek === day),
    };
  }
}
