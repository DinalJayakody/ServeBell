import { Injectable } from '@nestjs/common';
import { RealtimeEvent, type ManagedRestaurant } from '@servebell/shared';
import type { z } from 'zod';
import type { amenityInputSchema, menuCategoryInputSchema, menuItemInputSchema, menuItemPatchSchema, openingHoursSchema, serviceTypeInputSchema, updateRestaurantSchema, utensilInputSchema } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors.js';
import { fileUrl } from '../common/files.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { normalisePhone } from '../auth/auth.service.js';

type Actor = { userId: string; restaurantId: string };

/** Owner/admin management of a single restaurant. Every query is scoped by restaurantId. */
@Injectable()
export class ManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  private log(a: Actor, action: string, entityType: string, entityId?: string, meta?: object) {
    return this.audit.record({ action, entityType, entityId, actorUserId: a.userId, restaurantId: a.restaurantId, meta: meta as never });
  }

  /** Files attached to a restaurant must have been uploaded for that restaurant. */
  private async assertFile(restaurantId: string, fileId: string | null | undefined) {
    if (!fileId) return;
    const f = await this.prisma.fileObject.findFirst({ where: { id: fileId, restaurantId, status: 'READY' }, select: { id: true } });
    if (!f) throw Errors.badRequest('Image not found for this restaurant');
  }

  // ── Profile ──
  async getRestaurant(restaurantId: string): Promise<ManagedRestaurant> {
    const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, include: { cover: true, openingHours: { orderBy: [{ dayOfWeek: 'asc' }, { opensMinute: 'asc' }] } } });
    return {
      id: r.id, slug: r.slug, name: r.name, description: r.description, phone: r.phone, email: r.email, addressLine: r.addressLine, city: r.city, district: r.district,
      latitude: r.latitude, longitude: r.longitude, status: r.status, escalationMinutes: r.escalationMinutes, coverUrl: r.cover ? fileUrl(r.cover.storageKey) : null,
      openingHours: r.openingHours.map((h) => ({ dayOfWeek: h.dayOfWeek, opensMinute: h.opensMinute, closesMinute: h.closesMinute })),
    };
  }

  async updateRestaurant(a: Actor, input: z.infer<typeof updateRestaurantSchema>) {
    await this.assertFile(a.restaurantId, input.coverFileId);
    await this.prisma.restaurant.update({ where: { id: a.restaurantId }, data: { ...input, phone: input.phone === undefined ? undefined : normalisePhone(input.phone) } });
    await this.log(a, 'restaurant.updated', 'Restaurant', a.restaurantId, { fields: Object.keys(input) });
    return this.getRestaurant(a.restaurantId);
  }

  async setHours(a: Actor, input: z.infer<typeof openingHoursSchema>) {
    await this.prisma.$transaction([
      this.prisma.openingHours.deleteMany({ where: { restaurantId: a.restaurantId } }),
      this.prisma.openingHours.createMany({ data: input.hours.map((h) => ({ ...h, restaurantId: a.restaurantId })) }),
    ]);
    await this.log(a, 'restaurant.hours_updated', 'Restaurant', a.restaurantId);
    return this.getRestaurant(a.restaurantId);
  }

  /** Going live requires the basics customers need. */
  async setStatus(a: Actor, status: 'ACTIVE' | 'DRAFT') {
    if (status === 'ACTIVE') {
      const r = await this.prisma.restaurant.findUniqueOrThrow({ where: { id: a.restaurantId }, include: { _count: { select: { openingHours: true, menuItems: { where: { deletedAt: null } } } } } });
      if (r.status === 'SUSPENDED') throw Errors.forbidden('This restaurant is suspended by ServeBell');
      if (r._count.openingHours === 0) throw Errors.badRequest('Add opening hours before going live');
      if (r._count.menuItems === 0) throw Errors.badRequest('Add at least one menu item before going live');
    }
    await this.prisma.restaurant.update({ where: { id: a.restaurantId }, data: { status } });
    await this.log(a, `restaurant.${status === 'ACTIVE' ? 'published' : 'unpublished'}`, 'Restaurant', a.restaurantId);
    return this.getRestaurant(a.restaurantId);
  }

  // ── Menu ──
  async listCategories(restaurantId: string) {
    const rows = await this.prisma.menuCategory.findMany({ where: { restaurantId, deletedAt: null }, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }], include: { _count: { select: { items: { where: { deletedAt: null } } } } } });
    return rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind, sortOrder: c.sortOrder, isActive: c.isActive, itemCount: c._count.items }));
  }
  async createCategory(a: Actor, input: z.infer<typeof menuCategoryInputSchema>) {
    const c = await this.prisma.menuCategory.create({ data: { ...input, restaurantId: a.restaurantId } });
    this.menuChanged(a);
    return c;
  }
  async updateCategory(a: Actor, id: string, input: Partial<z.infer<typeof menuCategoryInputSchema>>) {
    await this.owned('menuCategory', a.restaurantId, id);
    const c = await this.prisma.menuCategory.update({ where: { id }, data: input });
    this.menuChanged(a);
    return c;
  }
  async deleteCategory(a: Actor, id: string) {
    await this.owned('menuCategory', a.restaurantId, id);
    const live = await this.prisma.menuItem.count({ where: { categoryId: id, deletedAt: null } });
    if (live) throw Errors.conflict('Move or delete the items in this category first');
    await this.prisma.menuCategory.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    this.menuChanged(a);
  }

  async listItems(restaurantId: string) {
    const rows = await this.prisma.menuItem.findMany({
      where: { restaurantId, deletedAt: null },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
      include: { images: { take: 1, orderBy: { sortOrder: 'asc' }, include: { file: true } } },
    });
    return rows.map((i) => ({ id: i.id, categoryId: i.categoryId, name: i.name, description: i.description, priceCents: i.priceCents, isAvailable: i.isAvailable, tags: i.tags, prepMinutes: i.prepMinutes, sortOrder: i.sortOrder, imageUrl: i.images[0] ? fileUrl(i.images[0].file.storageKey) : null }));
  }
  async createItem(a: Actor, input: z.infer<typeof menuItemInputSchema>) {
    await this.owned('menuCategory', a.restaurantId, input.categoryId);
    await this.assertFile(a.restaurantId, input.imageFileId);
    const { imageFileId, ...data } = input;
    const item = await this.prisma.menuItem.create({ data: { ...data, restaurantId: a.restaurantId, images: imageFileId ? { create: { fileId: imageFileId } } : undefined } });
    await this.log(a, 'menu.item_created', 'MenuItem', item.id);
    this.menuChanged(a);
    return item;
  }
  async updateItem(a: Actor, id: string, input: z.infer<typeof menuItemPatchSchema>) {
    await this.owned('menuItem', a.restaurantId, id);
    if (input.categoryId) await this.owned('menuCategory', a.restaurantId, input.categoryId);
    await this.assertFile(a.restaurantId, input.imageFileId);
    const { imageFileId, ...data } = input;
    const item = await this.prisma.$transaction(async (tx) => {
      if (imageFileId !== undefined) {
        await tx.menuItemImage.deleteMany({ where: { itemId: id } });
        if (imageFileId) await tx.menuItemImage.create({ data: { itemId: id, fileId: imageFileId } });
      }
      return tx.menuItem.update({ where: { id }, data });
    });
    await this.log(a, 'menu.item_updated', 'MenuItem', id, { fields: Object.keys(input) });
    this.menuChanged(a);
    return item;
  }
  async deleteItem(a: Actor, id: string) {
    await this.owned('menuItem', a.restaurantId, id);
    // Soft delete: order history keeps its snapshot and link.
    await this.prisma.menuItem.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.log(a, 'menu.item_deleted', 'MenuItem', id);
    this.menuChanged(a);
  }

  private menuChanged(a: Actor) {
    this.realtime.toStaff(a.restaurantId, RealtimeEvent.MENU_UPDATED, { restaurantId: a.restaurantId });
  }

  // ── Utensils / amenities / service types ──
  listUtensils(restaurantId: string) {
    return this.prisma.utensil.findMany({ where: { restaurantId }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, description: true, icon: true, isAvailable: true, isActive: true, sortOrder: true } });
  }
  createUtensil(a: Actor, input: z.infer<typeof utensilInputSchema>) {
    return this.prisma.utensil.create({ data: { ...input, restaurantId: a.restaurantId } });
  }
  async updateUtensil(a: Actor, id: string, input: Partial<z.infer<typeof utensilInputSchema>>) {
    await this.owned('utensil', a.restaurantId, id);
    return this.prisma.utensil.update({ where: { id }, data: input });
  }
  async deleteUtensil(a: Actor, id: string) {
    await this.owned('utensil', a.restaurantId, id);
    await this.prisma.utensil.delete({ where: { id } });
  }

  listAmenities(restaurantId: string) {
    return this.prisma.restaurantAmenity.findMany({ where: { restaurantId }, orderBy: { sortOrder: 'asc' }, select: { id: true, key: true, name: true, description: true, icon: true, isActive: true, sortOrder: true } });
  }
  createAmenity(a: Actor, input: z.infer<typeof amenityInputSchema>) {
    return this.prisma.restaurantAmenity.create({ data: { ...input, restaurantId: a.restaurantId } });
  }
  async updateAmenity(a: Actor, id: string, input: Partial<z.infer<typeof amenityInputSchema>>) {
    await this.owned('restaurantAmenity', a.restaurantId, id);
    return this.prisma.restaurantAmenity.update({ where: { id }, data: input });
  }
  async deleteAmenity(a: Actor, id: string) {
    await this.owned('restaurantAmenity', a.restaurantId, id);
    await this.prisma.restaurantAmenity.delete({ where: { id } });
  }

  listServiceTypes(restaurantId: string) {
    return this.prisma.serviceType.findMany({ where: { restaurantId }, orderBy: { sortOrder: 'asc' }, select: { id: true, kind: true, name: true, description: true, icon: true, utensilId: true, isPrimary: true, isActive: true, sortOrder: true } });
  }
  async createServiceType(a: Actor, input: z.infer<typeof serviceTypeInputSchema>) {
    if (input.utensilId) await this.owned('utensil', a.restaurantId, input.utensilId);
    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary) await tx.serviceType.updateMany({ where: { restaurantId: a.restaurantId }, data: { isPrimary: false } });
      return tx.serviceType.create({ data: { ...input, restaurantId: a.restaurantId } });
    });
  }
  async updateServiceType(a: Actor, id: string, input: Partial<z.infer<typeof serviceTypeInputSchema>>) {
    await this.owned('serviceType', a.restaurantId, id);
    if (input.utensilId) await this.owned('utensil', a.restaurantId, input.utensilId);
    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary) await tx.serviceType.updateMany({ where: { restaurantId: a.restaurantId, id: { not: id } }, data: { isPrimary: false } });
      return tx.serviceType.update({ where: { id }, data: input });
    });
  }
  /** Service types with history are deactivated rather than deleted. */
  async deleteServiceType(a: Actor, id: string) {
    await this.owned('serviceType', a.restaurantId, id);
    const used = await this.prisma.serviceRequest.count({ where: { serviceTypeId: id } });
    if (used) await this.prisma.serviceType.update({ where: { id }, data: { isActive: false } });
    else await this.prisma.serviceType.delete({ where: { id } });
  }

  /** Restaurant isolation: a row id from another restaurant behaves as "not found". */
  private async owned(model: 'menuCategory' | 'menuItem' | 'utensil' | 'restaurantAmenity' | 'serviceType', restaurantId: string, id: string) {
    const delegate = this.prisma[model] as unknown as { findFirst: (q: object) => Promise<unknown> };
    const where = model === 'menuCategory' || model === 'menuItem' ? { id, restaurantId, deletedAt: null } : { id, restaurantId };
    if (!(await delegate.findFirst({ where, select: { id: true } }))) throw Errors.notFound();
  }
}
