import { router } from 'expo-router';
import { AuthShell, DevQuickLogin, SignInFormView } from '@servebell/mobile-core';

export default function SignIn() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to request service, order and track your table." onClose={() => router.back()}>
      <SignInFormView onForgot={() => router.push('/(auth)/forgot-password')} onSignUp={() => router.replace('/(auth)/sign-up')} />
      <DevQuickLogin app="customer" />
    </AuthShell>
  );
}
