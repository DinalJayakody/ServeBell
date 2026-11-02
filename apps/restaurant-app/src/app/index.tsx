import { Redirect } from 'expo-router';
import { SessionStatusView, isAuthConfigured, useSession } from '@servebell/mobile-core';

/** Routes by session state. Authorization itself is enforced by the API. */
export default function Index() {
  const { status, user } = useSession();
  if (!isAuthConfigured() || status === 'initialising' || status === 'syncing' || status === 'error') return <SessionStatusView />;
  if (status === 'signedOut' || !user) return <Redirect href="/sign-in" />;
  if (user.memberships.length === 0) return <Redirect href="/join" />;
  return <Redirect href="/(tabs)/home" />;
}
