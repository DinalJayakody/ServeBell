import { create } from 'zustand';

export interface CartLine {
  key: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  optionIds: string[];
  optionNames: string[];
}

interface CartState {
  restaurantId: string | null;
  lines: CartLine[];
  note: string;
  add: (restaurantId: string, line: Omit<CartLine, 'key' | 'quantity'>, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  setNote: (note: string) => void;
  clear: () => void;
}

/**
 * Local cart for the current table. Prices here are for display only; the API
 * re-prices every order from the database.
 */
export const useCart = create<CartState>((set) => ({
  restaurantId: null,
  lines: [],
  note: '',
  add: (restaurantId, line, quantity = 1) =>
    set((s) => {
      const key = `${line.menuItemId}:${[...line.optionIds].sort().join(',')}`;
      const base = s.restaurantId === restaurantId ? s.lines : [];
      const existing = base.find((l) => l.key === key);
      const lines = existing ? base.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l)) : [...base, { ...line, key, quantity }];
      return { restaurantId, lines, note: s.restaurantId === restaurantId ? s.note : '' };
    }),
  setQuantity: (key, quantity) => set((s) => ({ lines: quantity <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, quantity } : l)) })),
  setNote: (note) => set({ note }),
  clear: () => set({ lines: [], note: '' }),
}));

export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.quantity, 0);
export const cartTotal = (lines: CartLine[]) => lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
