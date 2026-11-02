import { View } from 'react-native';
import { CloudOff } from 'lucide-react-native';
import { Button, ErrorState, LoadingState, Screen, Text, useTheme } from '@servebell/design-system';
import { isAuthConfigured } from './config';
import { session, useSession } from './session';

/** Renders blocking states for configuration problems and failed profile sync. */
export function SessionStatusView() {
  const t = useTheme();
  const { status, error } = useSession();
  if (!isAuthConfigured()) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
          <CloudOff size={36} color={t.colors.warning} />
          <Text variant="title2">Sign-in isn’t configured</Text>
          <Text variant="body" color="textSecondary">Copy .env.example to .env in this app and set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart Expo.</Text>
        </View>
      </Screen>
    );
  }
  if (status === 'error') {
    return (
      <Screen>
        <ErrorState network message={error ?? undefined} onRetry={() => void session.retrySync()} />
        <Button title="Sign out" variant="ghost" onPress={() => void session.signOut()} />
      </Screen>
    );
  }
  return (
    <Screen>
      <LoadingState label={status === 'syncing' ? 'Signing you in…' : undefined} />
    </Screen>
  );
}
