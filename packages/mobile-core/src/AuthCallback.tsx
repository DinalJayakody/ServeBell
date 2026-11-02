import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Linking from 'expo-linking';
import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { Button, IconBadge, LoadingState, Text, useTheme } from '@servebell/design-system';
import { NewPasswordFormView } from './AuthForms';
import { AuthShell } from './AuthShell';
import { authErrorMessage } from './supabase';
import { session } from './session';

type State = { kind: 'working' } | { kind: 'recovery' } | { kind: 'done'; title: string; body: string } | { kind: 'error'; message: string };

/**
 * Route `auth/callback`: target of the links in Supabase emails (sign-up
 * confirmation and password reset). `onContinue` leaves the screen afterwards.
 */
export function AuthCallbackScreen({ onContinue }: { onContinue: () => void }) {
  const t = useTheme();
  const url = Linking.useURL();
  const handled = useRef<string | null>(null);
  const [state, setState] = useState<State>({ kind: 'working' });

  useEffect(() => {
    // The launch URL arrives first and carries no result; only links with one are handled.
    if (!url || handled.current === url || !/[#?&](access_token|error)/.test(url)) return;
    handled.current = url;
    session
      .completeAuthLink(url)
      .then((r) => {
        if (!r) setState({ kind: 'error', message: 'This link is incomplete. Open the latest email from ServeBell again.' });
        else if (r.kind === 'error') setState({ kind: 'error', message: r.message });
        else if (r.kind === 'recovery') setState({ kind: 'recovery' });
        else setState({ kind: 'done', title: 'Email confirmed', body: 'Your account is ready. Welcome to ServeBell!' });
      })
      .catch((e) => setState({ kind: 'error', message: authErrorMessage(e) }));
  }, [url]);

  // Opened without a usable link (e.g. typed by hand): say so instead of spinning forever.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!handled.current) setState({ kind: 'error', message: 'This link is incomplete. Open the latest email from ServeBell again.' });
    }, 6000);
    return () => clearTimeout(timer);
  }, []);

  if (state.kind === 'working') return <LoadingState label="Confirming…" />;
  if (state.kind === 'recovery') {
    return (
      <AuthShell title="Choose a new password" subtitle="You’ll use it to sign in on all your devices.">
        <NewPasswordFormView onDone={() => setState({ kind: 'done', title: 'Password updated', body: 'You’re signed in with your new password.' })} />
      </AuthShell>
    );
  }
  const ok = state.kind === 'done';
  return (
    <AuthShell title={ok ? state.title : 'Link not valid'} subtitle={ok ? state.body : state.message}>
      <View style={{ alignItems: 'center', gap: 20, paddingTop: 8 }}>
        <IconBadge tone={ok ? 'success' : 'danger'} size={64} round>
          {ok ? <CircleCheck size={30} color={t.colors.success} /> : <CircleAlert size={30} color={t.colors.danger} />}
        </IconBadge>
        <Button title={ok ? 'Continue' : 'Back to ServeBell'} onPress={onContinue} style={{ alignSelf: 'stretch' }} />
        {!ok ? <Text variant="caption" color="textMuted" align="center">You can request a new link from the sign-in screen.</Text> : null}
      </View>
    </AuthShell>
  );
}
