import { router } from 'expo-router';
import { AuthCallbackScreen } from '@servebell/mobile-core';

/** Opened by links in ServeBell emails (confirm sign-up, reset password). */
export default function AuthCallback() {
  return <AuthCallbackScreen onContinue={() => router.replace('/')} />;
}
