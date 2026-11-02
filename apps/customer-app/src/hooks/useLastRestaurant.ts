import { create } from 'zustand';

/** Remembers the restaurant last browsed so the Menu tab has something to show before seating. */
export const useLastRestaurant = create<{ slug: string | null; name: string | null; set: (slug: string, name: string) => void }>((set) => ({
  slug: null,
  name: null,
  set: (slug, name) => set({ slug, name }),
}));
