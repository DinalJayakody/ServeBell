import { View } from 'react-native';
import { router } from 'expo-router';
import { LogOut, Moon, ShieldCheck } from 'lucide-react-native';
import { Avatar, Card, IconBadge, ListRow, Screen, SegmentedControl, Text, useTheme, useThemeContext, type ThemePreference } from '@servebell/design-system';
import { session, useSession } from '@servebell/mobile-core';

export default function Settings() {
  const t = useTheme();
  const { preference, setPreference } = useThemeContext();
  const user = useSession((s) => s.user);
  return (
    <Screen scroll>
      <Text variant="title1" style={{ marginTop: 8, marginBottom: 18 }}>Settings</Text>
      {user ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <Avatar name={user.fullName} uri={user.avatarUrl} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="title3" numberOfLines={1}>{user.fullName}</Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>{user.email}</Text>
          </View>
        </Card>
      ) : null}
      <View style={{ gap: 10, marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Moon size={16} color={t.colors.textSecondary} />
          <Text variant="captionStrong" color="textSecondary">Appearance</Text>
        </View>
        <SegmentedControl<ThemePreference> value={preference} onChange={setPreference} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </View>
      {user?.platformRole === 'PLATFORM_ADMIN' ? (
        <View style={{ marginBottom: 10 }}>
          <ListRow icon={<IconBadge size={34}><ShieldCheck size={17} color={t.colors.primary} /></IconBadge>} title="Review owner applications" subtitle="Platform administrator" onPress={() => router.push('/admin/applications')} />
        </View>
      ) : null}
      <ListRow icon={<IconBadge size={34} tone="danger"><LogOut size={17} color={t.colors.danger} /></IconBadge>} title="Sign out" destructive onPress={() => void session.signOut()} />
    </Screen>
  );
}
