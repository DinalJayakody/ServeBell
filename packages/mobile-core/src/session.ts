import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { createApiClient, ApiError } from '@servebell/api-client';
import { ErrorCode, type ClientApp, type SessionUser } from '@servebell/shared';
import { config } from './config';
import { firebaseAuth } from './firebase';

export type SessionStatus = 'initialising' | 'signedOut' | 'syncing' | 'signedIn' | 'error';

interface SessionState {
  status: SessionStatus;
  firebaseUser: FirebaseUser | null;
  user: SessionUser | null;
  error: string | null;
  setUser: (u: SessionUser) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'initialising',
  firebaseUser: null,
  user: null,
  error: null,
  setUser: (user) => set({ user }),
}));

export const api = createApiClient({
  baseUrl: config.apiUrl,
  getIdToken: async (force) => (await firebaseAuth().currentUser?.getIdToken(force)) ?? null,
  onUnauthenticated: () => void fbSignOut(firebaseAuth()),
});

const set = useSession.setState;
let clientApp: ClientApp = 'CUSTOMER';
let pendingProfile: { fullName?: string; phone?: string } = {};

async function syncProfile() {
  set({ status: 'syncing', error: null });
  try {
    const user = await api.auth.sync({ app: clientApp, ...pendingProfile });
    pendingProfile = {};
    set({ user, status: 'signedIn' });
  } catch (e) {
    const message = e instanceof ApiError ? e.message : 'Could not reach ServeBell';
    set({ status: 'error', error: message });
  }
}

/**
 * Call once at app start. Firebase restores the persisted session; we then
 * create/refresh the ServeBell profile so roles and memberships are current.
 */
export function startSession(app: ClientApp) {
  clientApp = app;
  return onIdTokenChanged(firebaseAuth(), (fbUser) => {
    const prev = useSession.getState().firebaseUser;
    set({ firebaseUser: fbUser });
    if (!fbUser) return set({ status: 'signedOut', user: null, error: null });
    // Token refreshes for the same user don't need a re-sync.
    if (prev?.uid !== fbUser.uid || useSession.getState().status !== 'signedIn') void syncProfile();
  });
}

export const session = {
  retrySync: syncProfile,
  async refreshUser() {
    const user = await api.auth.me();
    set({ user });
    return user;
  },
  async signIn(email: string, password: string) {
    await signInWithEmailAndPassword(firebaseAuth(), email, password);
  },
  async signUp(input: { fullName: string; email: string; password: string; phone?: string }) {
    pendingProfile = { fullName: input.fullName, phone: input.phone || undefined };
    const cred = await createUserWithEmailAndPassword(firebaseAuth(), input.email, input.password);
    await updateProfile(cred.user, { displayName: input.fullName });
    // Proves the address belongs to this person (required for staff/owner actions).
    await sendEmailVerification(cred.user).catch(() => undefined);
  },
  async signInWithGoogleIdToken(idToken: string) {
    await signInWithCredential(firebaseAuth(), GoogleAuthProvider.credential(idToken));
  },
  async signInWithApple(identityToken: string, rawNonce: string, fullName?: string) {
    if (fullName) pendingProfile = { fullName };
    const provider = new OAuthProvider('apple.com');
    await signInWithCredential(firebaseAuth(), provider.credential({ idToken: identityToken, rawNonce }));
  },
  /** Re-sends the verification email (Firebase rate-limits this server-side). */
  async resendVerification() {
    const u = firebaseAuth().currentUser;
    if (u) await sendEmailVerification(u);
  },
  /** After the user taps the link: refresh the Firebase user + token, then resync the profile. */
  async refreshVerification() {
    const u = firebaseAuth().currentUser;
    if (!u) return false;
    await u.reload();
    await u.getIdToken(true);
    await syncProfile();
    return Boolean(useSession.getState().user?.emailVerified);
  },
  sendPasswordReset(email: string) {
    return sendPasswordResetEmail(firebaseAuth(), email);
  },
  async signOut() {
    // Stop pushes to this device for the signed-out user.
    const { unregisterPush } = await import('./notifications');
    await unregisterPush();
    await fbSignOut(firebaseAuth());
  },
};

export const isProfileRequired = (e: unknown) => e instanceof ApiError && e.code === ErrorCode.PROFILE_REQUIRED;
