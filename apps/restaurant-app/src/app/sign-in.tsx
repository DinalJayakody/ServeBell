import { Redirect, router } from 'expo-router';
import { AuthShell, DevQuickLogin, SignInFormView, useSession } from '@servebell/mobile-core';

export default function SignIn() {
  const status = useSession((s) => s.status);
  if (status === 'signedIn') return <Redirect href="/" />;
  return (
    <AuthShell title="Sign in" subtitle="Owners, managers and customer assistants." tagline="For restaurant teams">
      <SignInFormView onForgot={() => router.push('/forgot-password')} onSignUp={() => router.push('/sign-up')} />
      <DevQuickLogin app="restaurant" />
    </AuthShell>
  );
}
