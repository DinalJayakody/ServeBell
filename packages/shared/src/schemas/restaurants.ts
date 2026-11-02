import { z } from 'zod';

export const restaurantListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  category: z.string().trim().max(60).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  cursor: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type RestaurantListQuery = z.infer<typeof restaurantListQuerySchema>;

export interface OpeningWindow {
  dayOfWeek: number;
  opensMinute: number;
  closesMinute: number;
}

export interface RestaurantSummary {
  id: string;
  slug: string;
  name: string;
  addressLine: string;
  city: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  coverUrl: string | null;
  categories: { slug: string; name: string }[];
  openNow: boolean;
  todayHours: OpeningWindow[];
}

export interface RestaurantDetail extends RestaurantSummary {
  description: string | null;
  phone: string | null;
  timezone: string;
  currency: string;
  images: { url: string; caption: string | null }[];
  openingHours: OpeningWindow[];
  amenities: { key: string; name: string; icon: string | null; description: string | null }[];
  utensils: { id: string; name: string; description: string | null; icon: string | null; isAvailable: boolean }[];
  services: { id: string; kind: string; name: string; icon: string | null; isPrimary: boolean }[];
  hasFloorPlan: boolean;
  reservableTables: number;
  acceptsReservations: boolean;
  isFavourite: boolean;
}

export interface Category {
  slug: string;
  name: string;
  icon: string | null;
}

/** Public result of scanning a table QR code. Contains no internal ids except what clients need to start a visit. */
export interface QrResolution {
  token: string;
  restaurant: Pick<RestaurantSummary, 'id' | 'slug' | 'name' | 'addressLine' | 'city' | 'coverUrl' | 'openNow'>;
  table: { id: string; label: string; capacity: number; zone: string | null };
}
