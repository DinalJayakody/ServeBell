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

const realFirebase = Boolean(process.env.EXPO_PUBLIC_FIREBASE_API_KEY);

/**
 * Without Firebase keys, development builds use the local Auth emulator with the
 * offline "demo-servebell" project (`pnpm dev:auth`). Production builds must set keys.
 */
const useEmulator = __DEV__ && (!realFirebase || Boolean(process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST));

export const config = {
  apiUrl: resolveApiUrl(),
  firebase: realFirebase
    ? {
        apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
        authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
      }
    : { apiKey: 'demo-api-key', authDomain: 'demo-servebell.firebaseapp.com', projectId: 'demo-servebell', appId: 'demo-app' },
  firebaseAuthEmulatorHost: useEmulator ? (process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || (devHost ? `${devHost}:9099` : '')) : '',
  google: {
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  },
};

export const isFirebaseConfigured = () => realFirebase || Boolean(config.firebaseAuthEmulatorHost);
export const isUsingAuthEmulator = () => Boolean(config.firebaseAuthEmulatorHost);

/** API-relative file paths (local dev storage) become absolute; R2 URLs pass through. */
export function mediaUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${config.apiUrl}${url}`;
}
setMediaResolver((u) => mediaUrl(u) ?? u);
