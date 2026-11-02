import { router } from 'expo-router';
import { AuthShell, SignUpFormView } from '@servebell/mobile-core';

export default function SignUp() {
  return (
    <AuthShell title="Create your account" subtitle="Better Service. Better Moments." onClose={() => router.back()}>
      <SignUpFormView onSignIn={() => router.replace('/(auth)/sign-in')} />
    </AuthShell>
  );
}
