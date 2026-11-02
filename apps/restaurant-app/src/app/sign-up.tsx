import { Redirect, router } from 'expo-router';
import { AuthShell, SignUpFormView, useSession } from '@servebell/mobile-core';

export default function SignUp() {
  const status = useSession((s) => s.status);
  if (status === 'signedIn') return <Redirect href="/" />;
  return (
    <AuthShell title="Create your staff account" subtitle="Then enter your invitation code or register your restaurant." tagline="For restaurant teams" onClose={() => router.back()}>
      <SignUpFormView onSignIn={() => router.back()} />
    </AuthShell>
  );
}
