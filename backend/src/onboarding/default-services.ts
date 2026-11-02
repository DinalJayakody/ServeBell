import type { ServiceKind } from '@servebell/shared';

/** Starter services for a new restaurant; owners can rename, disable or add more. */
export const DEFAULT_SERVICE_TYPES: { kind: ServiceKind; name: string; icon: string; isPrimary?: boolean }[] = [
  { kind: 'WAITER', name: 'Request a waiter', icon: 'bell-ring', isPrimary: true },
  { kind: 'WATER', name: 'Water', icon: 'glass-water' },
  { kind: 'UTENSIL', name: 'Fork & knife', icon: 'utensils' },
  { kind: 'UTENSIL', name: 'Spoon', icon: 'utensils' },
  { kind: 'UTENSIL', name: 'Glass', icon: 'wine' },
  { kind: 'UTENSIL', name: 'Tissue', icon: 'scroll-text' },
  { kind: 'BILL', name: 'Bill', icon: 'receipt-text' },
  { kind: 'CLEANING', name: 'Clean table', icon: 'sparkles' },
  { kind: 'ASSISTANCE', name: 'Assistance', icon: 'hand-helping' },
];

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'restaurant';
}
