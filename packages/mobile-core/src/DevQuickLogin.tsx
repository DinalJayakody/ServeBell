import { useState } from 'react';
import { View } from 'react-native';
import { FlaskConical } from 'lucide-react-native';
import { Chip, Text, useTheme } from '@servebell/design-system';
import { isUsingLocalAuth } from './config';
import { authErrorMessage } from './supabase';
import { session } from './session';

/** Seeded demo accounts (see backend/prisma/seed.ts). They exist only in the local Supabase stack. */
export const DEMO_PASSWORD = 'ServeBell#2026';
const ACCOUNTS = {
  customer: [{ label: 'Sarah (customer)', email: 'customer@servebell.dev' }],
  restaurant: [
    { label: 'Owner', email: 'owner@servebell.dev' },
    { label: 'Manager', email: 'manager@servebell.dev' },
    { label: 'Waiter Daniel', email: 'waiter@servebell.dev' },
    { label: 'Waiter Kasun', email: 'waiter2@servebell.dev' },
    { label: 'Platform admin', email: 'admin@servebell.dev' },
  ],
};

/** One-tap demo sign-in. Rendered only in development builds using the local Supabase stack. */
export function DevQuickLogin({ app }: { app: keyof typeof ACCOUNTS }) {
  const t = useTheme();
  const [error, setError] = useState<string | null>(null);
  if (!__DEV__ || !isUsingLocalAuth()) return null;
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: t.radii.md, borderWidth: 1, borderStyle: 'dashed', borderColor: t.colors.warning, marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <FlaskConical size={14} color={t.colors.warning} />
        <Text variant="captionStrong" color="warning">Development · demo accounts</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ACCOUNTS[app].map((a) => (
          <Chip key={a.email} label={a.label} onPress={() => session.signIn(a.email, DEMO_PASSWORD).catch((e) => setError(authErrorMessage(e)))} />
        ))}
      </View>
      {error ? <Text variant="caption" color="danger">{error} Run `pnpm dev:supabase`, then `SEED_DEMO_ACCOUNTS=true pnpm db:seed`.</Text> : null}
    </View>
  );
}

/** Dev deep link helper: signs in a demo account by email (local Supabase only). */
export async function devSignIn(email: string) {
  if (!__DEV__ || !isUsingLocalAuth() || !email.endsWith('@servebell.dev')) return false;
  await session.signIn(email, DEMO_PASSWORD);
  return true;
}
