import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import { config, isFirebaseConfigured } from './config';

let auth: Auth | null = null;

/** Firebase JS SDK (works in Expo Go). Session persists in AsyncStorage and refreshes itself. */
export function firebaseAuth(): Auth {
  if (auth) return auth;
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured. Set EXPO_PUBLIC_FIREBASE_* in the app .env file.');
  const app = getApps().length ? getApp() : initializeApp(config.firebase);
  try {
    auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    if (config.firebaseAuthEmulatorHost) connectAuthEmulator(auth, `http://${config.firebaseAuthEmulatorHost}`, { disableWarnings: true });
  } catch {
    // Fast refresh re-runs modules; initializeAuth may only be called once per app.
    auth = getAuth(app);
  }
  return auth;
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Choose a stronger password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/account-exists-with-different-credential': 'This email is registered with a different sign-in method.',
};

export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Please try again.';
}
