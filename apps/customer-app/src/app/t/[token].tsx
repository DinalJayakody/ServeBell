import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { QrCode } from 'lucide-react-native';
import { Button, ErrorState, LoadingState, Screen, Text, useTheme } from '@servebell/design-system';
import { useSession } from '@servebell/mobile-core';
import { useStartVisit } from '@/hooks/useStartVisit';
import { SignInPrompt } from '@/components/SignInPrompt';

/** Deep link target: servebell://t/<token> (and exp://…/--/t/<token> in Expo Go). */
export default function TableLink() {
  const t = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const status = useSession((s) => s.status);
  const start = useStartVisit();
  const started = useRef(false);

  useEffect(() => {
    if (status === 'signedIn' && token && !started.current) {
      started.current = true;
      start.mutate({ qr: token });
    }
  }, [status, token, start]);

  if (status === 'signedOut') {
    return (
      <Screen>
        <SignInPrompt title="Sign in to connect to your table" message="After signing in we’ll connect you automatically." />
      </Screen>
    );
  }
  if (start.isError) {
    return (
      <Screen>
        <ErrorState message={start.error.message} />
        <View style={{ paddingBottom: 16 }}><Button title="Scan again" variant="outline" icon={<QrCode size={18} color={t.colors.text} />} onPress={() => router.replace('/scan')} /></View>
      </Screen>
    );
  }
  return <Screen><LoadingState label="Connecting to your table…" /><Text variant="caption" color="textMuted" align="center"> </Text></Screen>;
}
