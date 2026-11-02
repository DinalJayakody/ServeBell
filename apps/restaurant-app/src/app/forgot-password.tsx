import { router } from 'expo-router';
import { AuthShell, ForgotPasswordFormView } from '@servebell/mobile-core';

export default function ForgotPassword() {
  return (
    <AuthShell title="Reset password" subtitle="We’ll email you a secure reset link." tagline="For restaurant teams" onClose={() => router.back()}>
      <ForgotPasswordFormView onDone={() => router.back()} />
    </AuthShell>
  );
}
