import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { useTheme } from '@servebell/design-system';
import { useSession } from '@servebell/mobile-core';

export default function AuthLayout() {
  const t = useTheme();
  const status = useSession((s) => s.status);
  // Close the auth flow as soon as the ServeBell profile is ready.
  useEffect(() => {
    if (status === 'signedIn' && router.canDismiss()) router.dismissAll();
  }, [status]);
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.background } }} />;
}
