import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, isAuthConfigured } from './config';

/**
 * Session storage in the iOS Keychain / Android Keystore. Values above ~2 KB are
 * split into chunks because SecureStore warns (and may fail) on larger items.
 */
const CHUNK = 1800;
const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const countKey = (key: string) => `${key}.chunks`;

const secureStorage = {
  async getItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(countKey(key), opts));
    if (!count) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`, opts)));
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    const previous = Number(await SecureStore.getItemAsync(countKey(key), opts)) || 0;
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p, opts)));
    await SecureStore.setItemAsync(countKey(key), String(parts.length), opts);
    for (let i = parts.length; i < previous; i++) await SecureStore.deleteItemAsync(`${key}.${i}`, opts);
  },
  async removeItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(countKey(key), opts)) || 0;
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`, opts);
    await SecureStore.deleteItemAsync(countKey(key), opts);
  },
};

let client: SupabaseClient | null = null;

/** Supabase Auth client (publishable key only; all data goes through the ServeBell API). */
export function supabase(): SupabaseClient {
  if (client) return client;
  if (!isAuthConfigured()) throw new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_* in the app .env file.');
  client = createClient(config.supabase.url, config.supabase.publishableKey, {
    auth: {
      storage: secureStorage,
      storageKey: 'servebell-auth',
      autoRefreshToken: true,
      persistSession: true,
      // Links from emails are handled explicitly by the auth/callback screen.
      detectSessionInUrl: false,
      flowType: 'implicit',
    },
  });
  // Refresh tokens only while the app is in the foreground (recommended for React Native).
  const sync = (state: string | null | undefined) => void (state === 'active' ? client?.auth.startAutoRefresh() : client?.auth.stopAutoRefresh());
  sync(AppState.currentState);
  AppState.addEventListener('change', sync);
  return client;
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Confirm your email first — open the link we sent you.',
  user_already_exists: 'An account with this email already exists.',
  email_exists: 'An account with this email already exists.',
  weak_password: 'Choose a stronger password (8+ characters with letters and numbers).',
  same_password: 'Choose a password you haven’t used for this account.',
  validation_failed: 'Enter a valid email address.',
  email_address_invalid: 'Enter a valid email address.',
  user_banned: 'This account has been disabled.',
  over_email_send_rate_limit: 'Too many emails sent. Please wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  otp_expired: 'This link has expired or was already used. Request a new one.',
  session_not_found: 'Your session has ended. Please sign in again.',
};

export function authErrorMessage(e: unknown): string {
  const err = e as { code?: string; name?: string; message?: string } | null;
  if (err?.code && MESSAGES[err.code]) return MESSAGES[err.code]!;
  if (err?.name === 'AuthRetryableFetchError') return 'No connection. Check your internet and try again.';
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Please try again.';
}
