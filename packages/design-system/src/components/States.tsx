import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AlertTriangle, WifiOff } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './Button';
import { IconBadge } from './IconBadge';

export function LoadingState({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }} accessibilityRole="progressbar">
      <ActivityIndicator color={t.colors.primary} />
      {label ? <Text variant="callout" color="textSecondary">{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: ReactNode; title: string; message?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 }}>
      <IconBadge size={64} tone="primary">{icon}</IconBadge>
      <Text variant="title3" align="center" style={{ marginTop: 6 }}>{title}</Text>
      {message ? <Text variant="callout" color="textSecondary" align="center">{message}</Text> : null}
      {action ? <Button title={action.label} onPress={action.onPress} size="md" fullWidth={false} style={{ marginTop: 10 }} /> : null}
    </View>
  );
}

export function ErrorState({ message, network, onRetry }: { message?: string; network?: boolean; onRetry?: () => void }) {
  const t = useTheme();
  const Icon = network ? WifiOff : AlertTriangle;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 }} accessibilityRole="alert">
      <IconBadge size={64} tone="danger"><Icon size={28} color={t.colors.danger} /></IconBadge>
      <Text variant="title3" align="center" style={{ marginTop: 6 }}>{network ? 'You’re offline' : 'Something went wrong'}</Text>
      <Text variant="callout" color="textSecondary" align="center">{message ?? 'Please try again in a moment.'}</Text>
      {onRetry ? <Button title="Try again" variant="outline" size="md" fullWidth={false} onPress={onRetry} style={{ marginTop: 10 }} /> : null}
    </View>
  );
}
