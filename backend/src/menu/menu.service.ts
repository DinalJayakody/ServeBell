import { Injectable } from '@nestjs/common';
import type { MenuItemView, MenuView } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors.js';
import { fileUrl } from '../common/files.js';

/** Public menu. Menu edits are visible immediately: no app release needed. */
@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async forRestaurant(idOrSlug: string): Promise<MenuView> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const r = await this.prisma.restaurant.findFirst({
      where: { ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }), status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        currency: true,
        menuCategories: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
          include: {
            items: {
              where: { isActive: true, deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              include: {
                images: { orderBy: { sortOrder: 'asc' }, take: 1, include: { file: { select: { storageKey: true } } } },
                optionGroups: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } },
              },
            },
          },
        },
      },
    });
    if (!r) throw Errors.notFound('Restaurant');
    return {
      restaurantId: r.id,
      currency: r.currency,
      categories: r.menuCategories.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        items: c.items.map(
          (i): MenuItemView => ({
            id: i.id,
            categoryId: c.id,
            name: i.name,
            description: i.description,
            priceCents: i.priceCents,
            imageUrl: i.images[0] ? fileUrl(i.images[0].file.storageKey) : null,
            isAvailable: i.isAvailable,
            tags: i.tags,
            prepMinutes: i.prepMinutes,
            optionGroups: i.optionGroups.map((g) => ({
              id: g.id,
              name: g.name,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              options: g.options.map((o) => ({ id: o.id, name: o.name, priceDeltaCents: o.priceDeltaCents, isAvailable: o.isAvailable })),
            })),
          }),
        ),
      })),
    };
  }
}
