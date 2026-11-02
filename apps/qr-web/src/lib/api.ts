import 'server-only';
import { createApiClient, ApiError } from '@servebell/api-client';

/** Server-side, unauthenticated client: the QR web experience only reads public data. */
export const api = createApiClient({
  baseUrl: process.env.API_URL ?? 'http://localhost:4000',
  getIdToken: async () => null,
  timeoutMs: 8_000,
});

export const isNotFound = (e: unknown) => e instanceof ApiError && e.status === 404;

export function formatMinutes(minutes: number) {
  const m = minutes % 1440;
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export const storeLinks = {
  appStore: process.env.NEXT_PUBLIC_APP_STORE_URL || null,
  playStore: process.env.NEXT_PUBLIC_PLAY_STORE_URL || null,
  scheme: process.env.NEXT_PUBLIC_APP_SCHEME || 'servebell',
  /** Development only: Expo Go URL of the Customer app, e.g. exp://192.168.1.5:8081 */
  expoDev: process.env.NODE_ENV !== 'production' ? process.env.EXPO_DEV_CUSTOMER_URL || null : null,
};
