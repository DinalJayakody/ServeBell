import { z } from 'zod';
import type { MenuKind, OrderStatus } from '../enums.js';

export interface MenuOptionView {
  id: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
}

export interface MenuOptionGroupView {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuOptionView[];
}

export interface MenuItemView {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isAvailable: boolean;
  tags: string[];
  prepMinutes: number | null;
  optionGroups: MenuOptionGroupView[];
}

export interface MenuCategoryView {
  id: string;
  name: string;
  kind: MenuKind;
  items: MenuItemView[];
}

export interface MenuView {
  restaurantId: string;
  currency: string;
  categories: MenuCategoryView[];
}

// ── Orders ──

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        menuItemId: z.uuid(),
        quantity: z.int().min(1).max(50),
        optionIds: z.array(z.uuid()).max(20).default([]),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(50),
  note: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().min(8).max(64),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']),
  reason: z.string().trim().max(200).optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const staffOrderQuerySchema = z.object({
  view: z.enum(['open', 'done']).default('open'),
  cursor: z.string().max(12).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export interface OrderItemView {
  id: string;
  menuItemId: string | null;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  options: string[];
  note: string | null;
}

export interface OrderView {
  id: string;
  number: number;
  status: OrderStatus;
  restaurant: { id: string; name: string };
  table: { id: string; label: string };
  customer: { id: string; fullName: string };
  guestCount: number | null;
  currency: string;
  subtotalCents: number;
  totalCents: number;
  note: string | null;
  items: OrderItemView[];
  createdAt: string;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

/** "LKR 1,850" — prices are integer cents everywhere; format only for display. */
export function formatMoney(cents: number, currency = 'LKR') {
  const value = cents / 100;
  return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
