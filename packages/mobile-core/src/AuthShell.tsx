import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { BellRing, X } from 'lucide-react-native';
import { Screen, Text, useTheme } from '@servebell/design-system';
import { SessionStatusView } from './SessionGate';
import { useSession } from './session';

/** Sign-in/up shell in the reference style: brand row over a dim restaurant photo, glass form card. */
export function AuthShell({ title, subtitle, tagline, onClose, children }: { title: string; subtitle: string; tagline?: string; onClose?: () => void; children: ReactNode }) {
  const t = useTheme();
  const status = useSession((s) => s.status);
  if (status === 'syncing' || status === 'error') return <SessionStatusView />;
  return (
    <Screen scroll edges={["top", "bottom"]} photo="dining" fullPhoto>
      <View style={{ height: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
        {onClose ? (
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <X size={22} color={t.colors.text} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 26 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BellRing size={30} color={t.colors.text} />
          <Text variant="display">ServeBell</Text>
        </View>
        <Text variant="callout" color="primary">{tagline ?? 'Your Table. Our Priority.'}</Text>
      </View>
      <View style={{ borderRadius: t.radii.xl, padding: 20, gap: 6, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border }}>
        <Text variant="title2" align="center">{title}</Text>
        <Text variant="caption" color="textSecondary" align="center" style={{ marginBottom: 12 }}>{subtitle}</Text>
        {children}
      </View>
    </Screen>
  );
}
