import { View } from 'react-native';
import { CloudOff } from 'lucide-react-native';
import { Button, ErrorState, LoadingState, Screen, Text, useTheme } from '@servebell/design-system';
import { isFirebaseConfigured } from './config';
import { session, useSession } from './session';

/** Renders blocking states for configuration problems and failed profile sync. */
export function SessionStatusView() {
  const t = useTheme();
  const { status, error } = useSession();
  if (!isFirebaseConfigured()) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
          <CloudOff size={36} color={t.colors.warning} />
          <Text variant="title2">Firebase isn’t configured</Text>
          <Text variant="body" color="textSecondary">Copy .env.example to .env in this app and fill in the EXPO_PUBLIC_FIREBASE_* values from your Firebase project, then restart Expo.</Text>
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
