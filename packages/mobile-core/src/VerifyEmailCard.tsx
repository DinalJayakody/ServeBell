import { useState } from 'react';
import { Alert, View } from 'react-native';
import { MailCheck } from 'lucide-react-native';
import { Button, Card, IconBadge, Text, useTheme } from '@servebell/design-system';
import { authErrorMessage } from './supabase';
import { session, useSession } from './session';

/** Shown until the signed-in user's email is verified. */
export function VerifyEmailCard({ reason }: { reason?: string }) {
  const t = useTheme();
  const user = useSession((s) => s.user);
  const [busy, setBusy] = useState<'resend' | 'check' | null>(null);
  if (!user || user.emailVerified) return null;
  const run = async (kind: 'resend' | 'check') => {
    setBusy(kind);
    try {
      if (kind === 'resend') {
        await session.resendVerification();
        Alert.alert('Email sent', `We sent a new verification link to ${user.email}.`);
      } else if (!(await session.refreshVerification())) {
        Alert.alert('Not verified yet', 'Open the link in the email we sent you, then tap “I’ve verified”.');
      }
    } catch (e) {
      Alert.alert('Something went wrong', authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card style={{ gap: 12, borderColor: t.colors.warning }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconBadge tone="warning"><MailCheck size={20} color={t.colors.warning} /></IconBadge>
        <View style={{ flex: 1 }}>
          <Text variant="title3">Verify your email</Text>
          <Text variant="caption" color="textSecondary">{reason ?? 'We sent a link to'} {user.email}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Resend" variant="outline" size="md" style={{ flex: 1 }} loading={busy === 'resend'} disabled={!!busy} onPress={() => void run('resend')} />
        <Button title="I’ve verified" size="md" style={{ flex: 1 }} loading={busy === 'check'} disabled={!!busy} onPress={() => void run('check')} />
      </View>
    </Card>
  );
}
