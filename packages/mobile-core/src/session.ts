import { create } from 'zustand';
import * as Linking from 'expo-linking';
import type { User as AuthUser } from '@supabase/supabase-js';
import { createApiClient, ApiError } from '@servebell/api-client';
import { ErrorCode, type ClientApp, type SessionUser } from '@servebell/shared';
import { config } from './config';
import { supabase } from './supabase';

export type SessionStatus = 'initialising' | 'signedOut' | 'syncing' | 'signedIn' | 'error';

interface SessionState {
  status: SessionStatus;
  authUser: AuthUser | null;
  user: SessionUser | null;
  error: string | null;
  /** Signed in through a password-reset link: the app must ask for a new password. */
  passwordRecovery: boolean;
  setUser: (u: SessionUser) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'initialising',
  authUser: null,
  user: null,
  error: null,
  passwordRecovery: false,
  setUser: (user) => set({ user }),
}));

async function accessToken(force?: boolean) {
  const { data } = force ? await supabase().auth.refreshSession() : await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export const api = createApiClient({
  baseUrl: config.apiUrl,
  getIdToken: accessToken,
  onUnauthenticated: () => void supabase().auth.signOut({ scope: 'local' }),
});

/** Where links in Supabase emails return to: servebell://auth/callback in builds, exp://…/--/auth/callback in Expo Go. */
export const authRedirectUrl = () => Linking.createURL('auth/callback');

const set = useSession.setState;
let clientApp: ClientApp = 'CUSTOMER';
// Apple shares the name only on the first sign-in, and not through the token.
let pendingProfile: { fullName?: string } = {};

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
 * Call once at app start. Supabase restores the persisted session; we then
 * create/refresh the ServeBell profile so roles and memberships are current.
 */
export function startSession(app: ClientApp) {
  clientApp = app;
  const { data } = supabase().auth.onAuthStateChange((event, s) => {
    const prev = useSession.getState();
    if (event === 'PASSWORD_RECOVERY') set({ passwordRecovery: true });
    set({ authUser: s?.user ?? null });
    if (!s) return set({ status: 'signedOut', user: null, error: null, passwordRecovery: false });
    // Token refreshes for the same user don't need a re-sync. Deferred: Supabase
    // calls made inside this callback would wait on the lock it holds.
    if (prev.authUser?.id !== s.user.id || prev.status !== 'signedIn') setTimeout(() => void syncProfile(), 0);
  });
  return () => data.subscription.unsubscribe();
}

/** Throws Supabase's AuthError so forms can show authErrorMessage(e). */
function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

export const session = {
  retrySync: syncProfile,
  async refreshUser() {
    const user = await api.auth.me();
    set({ user });
    return user;
  },
  async signIn(email: string, password: string) {
    check(await supabase().auth.signInWithPassword({ email: email.trim(), password }));
  },
  /**
   * Returns 'confirmEmail' when the project requires a confirmed address before
   * the first sign-in (production). Name and phone travel in user metadata and
   * fill the ServeBell profile on the first sync, whichever device that happens on.
   */
  async signUp(input: { fullName: string; email: string; password: string; phone?: string }): Promise<'signedIn' | 'confirmEmail'> {
    const { data } = check(
      await supabase().auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: { data: { full_name: input.fullName, ...(input.phone ? { phone: input.phone } : {}) }, emailRedirectTo: authRedirectUrl() },
      }),
    );
    return data.session ? 'signedIn' : 'confirmEmail';
  },
  async signInWithGoogleIdToken(idToken: string) {
    check(await supabase().auth.signInWithIdToken({ provider: 'google', token: idToken }));
  },
  async signInWithApple(identityToken: string, rawNonce: string, fullName?: string) {
    if (fullName) pendingProfile = { fullName };
    check(await supabase().auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce }));
  },
  /** Re-sends the confirmation email (rate-limited by Supabase). */
  async resendVerification(email = useSession.getState().user?.email ?? useSession.getState().authUser?.email) {
    if (!email) return;
    check(await supabase().auth.resend({ type: 'signup', email, options: { emailRedirectTo: authRedirectUrl() } }));
  },
  /** After the user taps the link: refresh the session, then resync the profile. */
  async refreshVerification() {
    check(await supabase().auth.refreshSession());
    await syncProfile();
    return Boolean(useSession.getState().user?.emailVerified);
  },
  async sendPasswordReset(email: string) {
    check(await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() }));
  },
  /**
   * Completes a link from a Supabase email (sign-up confirmation or password reset).
   * Supabase appends the result to the URL fragment: tokens on success, an error otherwise.
   */
  async completeAuthLink(url: string): Promise<{ kind: 'recovery' | 'signedIn' } | { kind: 'error'; message: string } | null> {
    const params = new URLSearchParams([url.split('#')[1], url.split('?')[1]?.split('#')[0]].filter(Boolean).join('&'));
    const error = params.get('error_description') ?? params.get('error');
    if (error) return { kind: 'error', message: params.get('error_code') === 'otp_expired' ? 'This link has expired or was already used. Request a new one.' : error.replace(/\+/g, ' ') };
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return null;
    const recovery = params.get('type') === 'recovery';
    if (recovery) set({ passwordRecovery: true });
    check(await supabase().auth.setSession({ access_token, refresh_token }));
    return { kind: recovery ? 'recovery' : 'signedIn' };
  },
  async updatePassword(password: string) {
    check(await supabase().auth.updateUser({ password }));
    set({ passwordRecovery: false });
  },
  async signOut() {
    // Stop pushes to this device for the signed-out user.
    const { unregisterPush } = await import('./notifications');
    await unregisterPush();
    // Revokes this device's session only; fall back to a local sign-out when offline.
    const { error } = await supabase().auth.signOut({ scope: 'local' });
    if (error) set({ status: 'signedOut', user: null, authUser: null, passwordRecovery: false });
  },
};

export const isProfileRequired = (e: unknown) => e instanceof ApiError && e.code === ErrorCode.PROFILE_REQUIRED;
