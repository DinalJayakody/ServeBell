import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ErrorState, LoadingState, Screen } from '@servebell/design-system';
import { authErrorMessage, devSignIn } from '@servebell/mobile-core';

/** Development only (Auth emulator): exp://<host>:<port>/--/dev/sign-in?email=waiter@servebell.dev */
export default function DevSignIn() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [state, setState] = useState<'working' | 'done' | string>('working');
  useEffect(() => {
    devSignIn(email ?? '')
      .then((ok) => setState(ok ? 'done' : 'Dev sign-in is only available with the local Auth emulator.'))
      .catch((e) => setState(authErrorMessage(e)));
  }, [email]);
  if (state === 'done') return <Redirect href="/" />;
  return <Screen>{state === 'working' ? <LoadingState label="Signing in…" /> : <ErrorState message={state} />}</Screen>;
}
