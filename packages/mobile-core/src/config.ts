import Constants from 'expo-constants';
import { setMediaResolver } from '@servebell/design-system';

/** LAN host Expo Go loaded the bundle from (e.g. "192.168.1.5"); also works on the iOS simulator. */
const devHost = __DEV__ ? Constants.expoConfig?.hostUri?.split(':')[0] : undefined;

/**
 * API base URL resolution, in order:
 * 1. EXPO_PUBLIC_API_URL (staging/production builds, or a tunnel URL).
 * 2. In development, the dev machine's host + backend port, so a physical phone
 *    and the simulator both reach the API without editing anything.
 */
function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (devHost) return `http://${devHost}:${process.env.EXPO_PUBLIC_API_PORT ?? '4000'}`;
  throw new Error('EXPO_PUBLIC_API_URL is not set for this build');
}

/** The local Supabase stack's fixed development key (`supabase status`); not a secret. */
const LOCAL_PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

/**
 * Supabase Auth. Builds set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
 * Development without them uses the local stack (`pnpm dev:supabase`) on the dev machine.
 */
const explicitSupabase = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const supabaseUrl = explicitSupabase || (devHost ? `http://${devHost}:54321` : '');
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || (!explicitSupabase && devHost ? LOCAL_PUBLISHABLE_KEY : '');

export const config = {
  apiUrl: resolveApiUrl(),
  supabase: { url: supabaseUrl, publishableKey: supabaseKey },
  google: {
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  },
};

export const isAuthConfigured = () => Boolean(config.supabase.url && config.supabase.publishableKey);
/** True when signing in against the local Supabase stack (demo accounts available). */
export const isUsingLocalAuth = () => Boolean(devHost) && !explicitSupabase;

/** API-relative file paths (local dev storage) become absolute; R2 URLs pass through. */
export function mediaUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${config.apiUrl}${url}`;
}
setMediaResolver((u) => mediaUrl(u) ?? u);
